const dataManager = require("./dataManager");
const httpServer = require("./httpServer");
const wireguardHelper = require("./wgHelper");
const config = require("./config.js");

async function main () {
	await wireguardHelper.ensureInstalled();
	const server_config = await dataManager.loadServerConfig();

	let state = {
		config: {
			port: config.ENV.SERVER_PORT,
			devLogs: false
		},
		server_config: server_config
	};


	state = await wireguardHelper.checkServerKeys(state)
	httpServer.initServer(state, function(){
		console.log(`WireGuard-Dashboard listening on port ${state.config.port}!`);
	});

}

main()
	.then(console.log)
	.catch(console.error);
