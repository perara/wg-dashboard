const nunjucks = require("nunjucks");
const fs = require("fs");
const util = require('util');
const ConfigParser = require('configparser');
const asyncStat = util.promisify(fs.stat);
const asyncWriteFile = util.promisify(fs.writeFile);
const state = require("./state")();
const assert = require("assert").strict;
const wgHelper = require("./wgHelper");
const config = require("./config");
const ni = require('network-interfaces');
const options = {
	internal: false, // boolean: only acknowledge internal or external addresses (undefined: both)
	ipVersion: 4     // integer (4 or 6): only acknowledge addresses of this IP address family (undefined: both)
};
/**
 * Save Dashboard and WireGuard configuration to disk
 */

async function saveConfig(serverConfigPartial){
	let fullConfig = {};
	try {
		await fs.promises.stat(config.ENV.WG_CONFIG_FILE);
		fullConfig = JSON.parse((await fs.promises.readFile(config.SERVER_CONFIG_PATH)));
	}catch(e){
		// Does not exist, create file
		await fs.promises.mkdir(config.ENV.SERVER_CONFIG_DIR, { recursive: true });
		fullConfig = serverConfigPartial;
	}
	Object.keys(serverConfigPartial).forEach((k) => {
		fullConfig[k] = serverConfigPartial[k];
	});

	return await fs.promises.writeFile(config.SERVER_CONFIG_PATH, JSON.stringify(fullConfig, null, 2), {
		mode: 0o600
	});






}

async function loadWireguardConfig(){
	const wgConfig = new ConfigParser();
	try {
		await fs.promises.stat(config.ENV.WG_CONFIG_FILE);
		await wgConfig.readAsync(config.ENV.WG_CONFIG_FILE);

		// Ensure interface block
		if(!wgConfig.sections().includes("Interface")) {
			throw new Error("Missing Interface block");
		}

		// Configuration exists. Validate and fill in if missing
		state.wg.Address = wgConfig.get("Interface", "Address")
			|| config.ENV.WG_VIRTUAL_IP + "/" + config.ENV.WG_VIRTUAL_IP_CIDR;
		state.wg.ListenPort = wgConfig.get("Interface", "ListenPort") || config.ENV.WG_LISTEN_PORT;
		state.wg.PrivateKey = wgConfig.get("Interface", "PrivateKey") || (await wgHelper.generatePrivateKey());
		state.wg.DNS = wgConfig.get("Interface", "DNS") || config.ENV.WG_DNS_SERVER;
		state.wg.PostUp = wgConfig.get("Interface", "PostUp") || config.ENV.WG_POST_UP;
		state.wg.PostDown = wgConfig.get("Interface", "PostDown")|| config.ENV.WG_POST_DOWN;
		saveConfig({
			wg: state.wg
		});
	}catch(e){
		// No wireguard configuration
		wgConfig.addSection("Interface");
		wgConfig.set("Interface", "Address", config.ENV.WG_VIRTUAL_IP + "/" + config.ENV.WG_VIRTUAL_IP_CIDR);
		wgConfig.set("Interface", "ListenPort", config.ENV.WG_LISTEN_PORT);
		wgConfig.set("Interface", "PrivateKey", (await wgHelper.generatePrivateKey()));
		wgConfig.set("Interface", "DNS", config.ENV.WG_DNS_SERVER);
		wgConfig.set("Interface", "PostUp", config.ENV.WG_POST_UP);
		wgConfig.set("Interface", "PostDown", config.ENV.WG_POST_DOWN);
		wgConfig.write(config.ENV.WG_CONFIG_FILE);
		await loadServerConfig()
	}
}

async function getNetworkAdapter(index){
	const interfaces = ni.getInterfaces().filter(x => x !== "lo");
	return interfaces[index] || new Error("There is no available network adapters");
}

async function getIPAddress(iface){
	return ni.toIp(iface);
}

async function computePeers() {
	// TODO - Compute peers by merging both wg0.conf and the dictionary.
}

async function loadServerConfig() {
	let serverConfig = {};
	try {
		await fs.promises.stat(config.SERVER_CONFIG_PATH);
		serverConfig = JSON.parse((await fs.promises.readFile(config.SERVER_CONFIG_PATH)))
	} catch (e) {}

	state.server.privateTraffic = serverConfig.privateTraffic;
	state.server.allowedIPs = serverConfig.allowedIPs || config.ENV.SERVER_ALLOWED_IPS;
	state.server.DNSOverTLS = serverConfig.DNSOverTLS || config.ENV.SERVER_DNS_TLS;
	state.server.TLSServerHost = serverConfig.TLSServerHost || config.ENV.SERVER_TLS_HOST;
	state.server.WGConfigFile = serverConfig.WGConfigFile || config.ENV.WG_CONFIG_FILE;
	state.server.peers = await computePeers();
	state.server.Interface = serverConfig.Interface || (
		config.ENV.Interface || (await getNetworkAdapter(0))
	);
	console.log(serverConfig.users);
	state.server.users = serverConfig.users || [];
	state.server.Port = serverConfig.Port || config.ENV.SERVER_PORT;
	state.server.IPAddress = serverConfig.IPAddress || (await getIPAddress(state.server.Interface));
	state.server.PublicKey = serverConfig.PublicKey || (await wgHelper.generatePublicKey(state.wg.PrivateKey));


	await saveConfig({
		server: state.server,
	})
}
/*

exports.saveBothConfigs = (server_config, cb) => {
	exports.saveServerConfig(server_config, err => {
		if (err) {
			cb("COULD_NOT_SAVE_SERVER_CONFIG");
			return;
		}

		exports.saveWireguardConfig(server_config, err => {
			if (err) {
				cb("COULD_NOT_SAVE_WIREGUARD_CONFIG");
				return;
			}

			cb();
		});
	});
};


exports.saveWireguardConfig = (server_config, cb) => {
	const config = nunjucks.render("templates/config_server.njk", {
		virtual_ip_address: server_config.virtual_ip_address,
		cidr: server_config.cidr,
		private_key: server_config.private_key,
		port: server_config.port,
		network_adapter: server_config.network_adapter,
		peers: server_config.peers,
	});

	// write main config
	fs.writeFile(server_config.config_path, config, {mode: 0o600}, err => {
		if (err) {
			cb(err);
			return;
		}

		const coredns_config = nunjucks.render(
			"templates/coredns_corefile.njk",
			{
				dns_over_tls: server_config.dns_over_tls,
				ip: server_config.dns,
				tls_servername: server_config.tls_servername,
			}
		);

		// write new coredns config
		fs.writeFile("/etc/coredns/Corefile", coredns_config, err => {
			if (err) {
				cb(err);
				return;
			}

			// restart coredns
			wgHelper.restartCoreDNS(err => {
				if (err) {
					cb(err);
					return;
				}

				cb(null);
			});
		});
	});
};
*/
module.exports = {
	loadServerConfig: loadServerConfig,
	saveConfig: saveConfig,
	loadWireguardConfig: loadWireguardConfig
};
