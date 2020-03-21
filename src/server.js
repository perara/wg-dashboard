const dataManager = require("./dataManager");
const httpServer = require("./httpServer");
const wireguardHelper = require("./wgHelper");
const state = require("./state")();
const utils = require("./utils");
async function main () {
	await utils.setupLogging();

	await wireguardHelper.ensureInstalled();
	await dataManager.loadWireguardConfig();
	await dataManager.loadServerConfig();
	await dataManager.saveConfig({
		server: state.server,
		wg: state.wg
	});

	httpServer.initServer(function(){
		console.log(`WireGuard-Dashboard listening on port ${state.server.Port}!`);
	});

}

main()
	.then(console.log)
	.catch(console.error);
