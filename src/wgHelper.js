const dataManager = require("./dataManager");
const child_process = require("child_process");
const util = require("util");
const exec = util.promisify(child_process.exec);
const spawn = util.promisify(child_process.spawn);
const config = require("./config");
const state = require("./state")();

async function ensureInstalled(){
	const { stderr } = await exec(config.WG);
	if (stderr) {
		console.error("Wireguard is possibly not installed?");
		process.exit(1);
	}


}


async function generatePublicKey(privateKey){
	return (await exec(config.WG_PUBKEY(privateKey))).stdout.trim()
}

async function generatePrivateKey(){
	let result = await exec(config.WG_GENKEY);  // Generate private-key
	return result.stdout.trim() // Trim silly spaces
}



async function generateKeyPair(){
	const privateKey = generatePrivateKey();
	const publicKey = generatePublicKey(privateKey);
	return {
		privateKey: privateKey,
		publicKey: publicKey
	}
}

async function stopWireguard(cb){
	child_process.exec(config.WG_DOWN, (err, stdout, stderr) => {
		if (err || stderr) {
			cb(err);
			return;
		}

		cb();
	});
};

async function startWireguard(cb){
	child_process.exec(
		config.WG_UP,
		(err, stdout, stderr) => {
			if (err || stderr) {
				cb(err);
				return;
			}

			cb();
		}
	);
};

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
};

async function getNetworkAdapter(cb){
	child_process.exec(
		"ip route | grep default | cut -d ' ' -f 5",
		(err, stdout, stderr) => {
			if (err || stderr) {
				cb(err);
				return;
			}

			cb(null, stdout.replace(/\n/, ""));
		}
	);
};

async function getNetworkIP(cb){

	exports.getNetworkAdapter((interface) => {
		child_process.exec(
			"ifconfig " + interface + " | grep inet | head -n 1 | xargs | cut -d ' ' -f 2",
			(err, stdout, stderr) => {
				if (err || stderr) {
					cb(err);
					return;
				}

				cb(null, stdout.replace(/\n/, ""));
			}
		);
	});



};

async function addPeer(peer, cb){
	child_process.exec(
		`wg set ${config.ENV.WG_INTERFACE} peer ${peer.public_key} allowed-ips ${peer.allowed_ips}/32`,
		(err, stdout, stderr) => {
			if (err || stderr) {
				cb(err);
				return;
			}

			cb(null);
		}
	);
};

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
	getNetworkIP:getNetworkIP,
	getNetworkAdapter:getNetworkAdapter,
	wireguardStatus:wireguardStatus,
	startWireguard:startWireguard,
	stopWireguard:stopWireguard,
	generatePublicKey:generatePublicKey,
	generatePrivateKey:generatePrivateKey
};
