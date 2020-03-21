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
const winston = require("winston");
const utils = require("./utils");
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


	await saveWireguardConfig(true);


	return await fs.promises.writeFile(config.SERVER_CONFIG_PATH, JSON.stringify(fullConfig, null, 2), {
		mode: 0o600
	});

}

async function saveWireguardConfig(fromState){


	const address = fromState ? state.wg.Address : config.ENV.WG_VIRTUAL_IP + "/" + config.ENV.WG_VIRTUAL_IP_CIDR;
	const listenPort = fromState ? state.wg.ListenPort : config.ENV.WG_LISTEN_PORT;
	const privateKey = fromState ? state.wg.PrivateKey : (await wgHelper.generatePrivateKey());
	const dnsServer = fromState ? state.wg.DNS : config.ENV.WG_DNS_SERVER;
	const wgUP = fromState ? state.wg.PostUp : config.ENV.WG_POST_UP;
	const wgDown = fromState ? state.wg.PostDown : config.ENV.WG_POST_DOWN;
	const configFile = fromState ? state.server.WGConfigFile : config.ENV.WG_CONFIG_FILE;
	const peers = state.wg.Peers || [];

	const wgConfig = new ConfigParser({
		strict: false
	});
	wgConfig.addSection("Interface");
	wgConfig.set("Interface", "Address", address);
	wgConfig.set("Interface", "ListenPort", listenPort);
	wgConfig.set("Interface", "PrivateKey", privateKey);
	wgConfig.set("Interface", "DNS", dnsServer);
	wgConfig.set("Interface", "PostUp", wgUP);
	wgConfig.set("Interface", "PostDown", wgDown);
	for(let i = 0; i < peers.length; i++){
		wgConfig.addSection("Peer");
		for(let k in peers[i]){
			if(!peers[i].hasOwnProperty(k)) continue;
			let v = peers[i][k];
			wgConfig.set("Peer", k, v, i)
		}

	}

	await wgConfig.writeAsync(configFile);
}

async function loadWireguardConfig(){
	const wgConfig = new ConfigParser({
		strict: false
	});
	try {
		await fs.promises.stat(config.ENV.WG_CONFIG_FILE);
		await wgConfig.readAsync(config.ENV.WG_CONFIG_FILE);


		// Ensure interface block
		if(!wgConfig.sections().includes("Interface")) {
			throw new Error("Missing Interface block");
		}

		winston.info("Found wireguard configuration. Loading...");
		// Configuration exists. Validate and fill in if missing
		state.wg.Address = wgConfig.get("Interface", "Address")
			|| config.ENV.WG_VIRTUAL_IP + "/" + config.ENV.WG_VIRTUAL_IP_CIDR;

		state.wg.ListenPort = wgConfig.get("Interface", "ListenPort") || config.ENV.WG_LISTEN_PORT;
		state.wg.PrivateKey = wgConfig.get("Interface", "PrivateKey") || (await wgHelper.generatePrivateKey());
		state.wg.DNS = wgConfig.get("Interface", "DNS") || config.ENV.WG_DNS_SERVER;
		state.wg.PostUp = wgConfig.get("Interface", "PostUp") || config.ENV.WG_POST_UP;
		state.wg.PostDown = wgConfig.get("Interface", "PostDown")|| config.ENV.WG_POST_DOWN;
		state.wg.Peers = wgConfig._sections.Peer;

	}catch(e){
		winston.info(e);
	}
}

async function getNetworkAdapter(index){
	const interfaces = ni.getInterfaces().filter(x => x !== "lo");
	return interfaces[index] || new Error("There is no available network adapters");
}

async function getIPAddress(iface){
	return ni.toIp(iface);
}

async function computePeers(serverPeers) {
	// TODO - Compute peers by merging both wg0.conf and the dictionary.
	const wgConfig = new ConfigParser({
		strict:false
	});
	await wgConfig.readAsync(state.server.WGConfigFile);
	const wgPeers = wgConfig._sections.Peer;

	let collection = [];
	collection.push(...serverPeers);
	collection.push(...wgPeers);
	collection = utils.removeDuplicates(collection, "Address");
	return collection;
}

async function loadServerConfig() {
	let serverConfig = {};
	let wgServerConfig = {};
	try {
		await fs.promises.stat(config.SERVER_CONFIG_PATH);
		const fullConfig = JSON.parse((await fs.promises.readFile(config.SERVER_CONFIG_PATH)))
		serverConfig = fullConfig.server;
		wgServerConfig = fullConfig.wg;
	} catch (e) {}

	state.server.privateTraffic = serverConfig.privateTraffic;
	state.server.allowedIPs = serverConfig.allowedIPs || config.ENV.SERVER_ALLOWED_IPS;
	state.server.DNSOverTLS = serverConfig.DNSOverTLS || config.ENV.SERVER_DNS_TLS;
	state.server.TLSServerHost = serverConfig.TLSServerHost || config.ENV.SERVER_TLS_HOST;
	state.server.WGConfigFile = serverConfig.WGConfigFile || config.ENV.WG_CONFIG_FILE;
	state.server.Peers = serverConfig.Peers || []; //await computePeers(wgServerConfig.Peers);
	state.server.Interface = serverConfig.Interface || (
		config.ENV.Interface || (await getNetworkAdapter(0))
	);

	state.server.users = serverConfig.users || [];
	state.server.Port = serverConfig.Port || config.ENV.SERVER_PORT;
	state.server.IPAddress = serverConfig.IPAddress || (await getIPAddress(state.server.Interface));
	state.server.PublicKey = serverConfig.PublicKey || (await wgHelper.generatePublicKey(state.wg.PrivateKey));

}

module.exports = {
	loadServerConfig: loadServerConfig,
	saveConfig: saveConfig,
	loadWireguardConfig: loadWireguardConfig
};
