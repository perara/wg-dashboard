const dataManager = require("./dataManager");
const child_process = require("child_process");
const util = require("util");
const exec = util.promisify(child_process.exec);
const config = require("./config");
const state = require("./state")();
const winston = require("winston");

async function ensureInstalled(){
	const { stderr } = await exec(config.WG);
	if (stderr) {
		winston.error("Wireguard is not installed!");
		process.exit(1);
	}
	winston.debug("Wireguard is detected.");
}


async function generatePublicKey(privateKey){
	return (await exec(config.WG_PUBKEY(privateKey))).stdout.trim()
}

async function generatePrivateKey(){
	try{
		let result = await exec(config.WG_GENKEY);  // Generate private-key
		return result.stdout.trim() // Trim silly spaces
	}catch (e) {
		winston.error(e);
	}

}



async function generateKeyPair(){
	const privateKey = await generatePrivateKey();
	const publicKey = await generatePublicKey(privateKey);
	return {
		privateKey: privateKey,
		publicKey: publicKey
	}
}

async function stopWireguard(){
	try{
		await exec(config.WG_DOWN(state.server.WGConfigFile));
		return true;
	}catch (result) {
		return result.stderr.includes("is not a WireGuard interface");

	}
}

async function startWireguard(){
	try{
		await exec(config.WG_UP(state.server.WGConfigFile));
		return true;
	}catch (result) {
		return false;
	}
}

async function wireguardStatus(cb){
	child_process.exec(
		config.WG_STATUS,
		(err, stdout, stderr) => {
			if (err || stderr) {
				cb(err);
				return;
			}

			cb(null, stdout);
		}
	);
}



async function addPeer(peer){
	try{
		await exec(config.WG_STRIP());
		return true;
	}catch (result) {
		winston.error(result)
		return false;
	}
}

async function reload(){
	try{
		await exec(config.WG_STRIP());
		return true;
	}catch (result) {
		winston.error(result)
		return false;
	}
}

async function deletePeer(peer, cb){
	child_process.exec(
		`wg set ${config.ENV.WG_INTERFACE} peer ${peer.public_key} remove`,
		(err, stdout, stderr) => {
			if (err || stderr) {
				cb(err);
				return;
			}

			cb(null);
		}
	);
};

module.exports = {
	generateKeyPair: generateKeyPair,
	ensureInstalled: ensureInstalled,
	deletePeer: deletePeer,
	addPeer:addPeer,
	wireguardStatus:wireguardStatus,
	startWireguard:startWireguard,
	stopWireguard:stopWireguard,
	generatePublicKey:generatePublicKey,
	generatePrivateKey:generatePrivateKey,
	reload: reload
};
