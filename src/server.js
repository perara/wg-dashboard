const dataManager = require("./dataManager");
const httpServer = require("./httpServer");
const wireguardHelper = require("./wgHelper");
const state = require("./state")();
const { once } = require('events');

async function main () {
	await wireguardHelper.ensureInstalled();
	await dataManager.loadWireguardConfig();
	await dataManager.loadServerConfig();
	console.log(state)
	httpServer.initServer(function(){
		console.log(`WireGuard-Dashboard listening on port ${state.server.Port}!`);
	});

}

main()
	.then(console.log)
	.catch(console.error);
