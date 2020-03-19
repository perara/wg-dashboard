const nunjucks = require("nunjucks");
const fs = require("fs");
const util = require('util');

const asyncStat = util.promisify(fs.stat);
const asyncWriteFile = util.promisify(fs.writeFile);

const assert = require("assert").strict;

const config = require("./config");
const ni = require('network-interfaces');
const options = {
	internal: false, // boolean: only acknowledge internal or external addresses (undefined: both)
	ipVersion: 4     // integer (4 or 6): only acknowledge addresses of this IP address family (undefined: both)
};
/**
 * Save Dashboard and WireGuard configuration to disk
 */

async function saveServerConfig(server_config){
	await fs.promises.mkdir(config.ENV.SERVER_CONFIG_DIR, { recursive: true })
	return await fs.promises.writeFile(config.SERVER_CONFIG_PATH, JSON.stringify(server_config, null, 2), {
		mode: 0o600
	});
}

async function loadServerConfig(){
	try {
		await fs.promises.stat(config.SERVER_CONFIG_PATH)
	}catch(e){
		// No config file, create
		const interfaces = ni.getInterfaces().filter(x => x !== "lo");
		const iface = interfaces[0];
		const ip = ni.toIp(iface);
		const defaultConfig = config.DEFAULT_CONFIG(iface, ip);
		await this.saveServerConfig(defaultConfig);
	}

	// File exists now with default configuration
	const buffer = await fs.promises.readFile(config.SERVER_CONFIG_PATH);
	const parsed = JSON.parse(buffer.toString());
	const peersWithoutVirtualIP = parsed.peers.filter(p => !!p.virtual_ip);
	const needSave = peersWithoutVirtualIP.length > 0;

	
	if(needSave) {
		// Save updated config without peers without virtual IP
		parsed.peers = peersWithoutVirtualIP;
		await this.saveServerConfig(parsed);
	}

	return parsed;
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
	saveServerConfig: saveServerConfig
};
