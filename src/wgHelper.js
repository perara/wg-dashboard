const dataManager = require("./dataManager");
const child_process = require("child_process");
const util = require("util");
const exec = util.promisify(child_process.exec);
const spawn = util.promisify(child_process.spawn);
const config = require("./config");

async function ensureInstalled(){
	const { stderr } = await exec(config.WG);
	if (stderr) {
		console.error("Wireguard is possibly not installed?");
		process.exit(1);
	}


}

async function checkServerKeys(state){
	if (state.server_config.private_key && state.server_config.public_key) {
		return state;
	}

	let result = await exec(config.WG_GENKEY);  // Generate private-key
	const privateKey = result.stdout.trim();  // Trim silly spaces
	const publicKey = (await exec(config.WG_PUBKEY(privateKey))).stdout.trim();

	state.server_config.public_key = privateKey;
	state.server_config.private_key = publicKey;
	await dataManager.saveServerConfig(state.server_config);

	return state;
}

exports.generateKeyPair = cb => {
	child_process.exec("wg genkey", (err, stdout, stderr) => {
		if (err || stderr) {
			cb(err);
			return;
		}

		const private_key = stdout.replace(/\n/, "");

		child_process.exec(
			`echo "${private_key}" | wg pubkey`,
			(err, stdout, stderr) => {
				if (err || stderr) {
					cb(err);
					return;
				}

				const public_key = stdout.replace(/\n/, "");

				cb(null, {
					private_key: private_key,
					public_key: public_key,
				});
			}
		);
	});
};

exports.stopWireguard = cb => {
	child_process.exec(config.WG_DOWN, (err, stdout, stderr) => {
		if (err || stderr) {
			cb(err);
			return;
		}

		cb();
	});
};

exports.startWireguard = cb => {
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

exports.wireguardStatus = cb => {
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

exports.getNetworkAdapter = cb => {
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

exports.getNetworkIP = cb => {

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

exports.addPeer = (peer, cb) => {
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

exports.deletePeer = (peer, cb) => {
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
	checkServerKeys: checkServerKeys,
	ensureInstalled: ensureInstalled
};
