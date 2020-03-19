const dataManager = require("./dataManager");
const httpServer = require("./httpServer");
const wireguardHelper = require("./wgHelper");
const config = require("./config.js");
/*
function main() {
	dataManager.loadServerConfig((err, server_config) => {
		if (err) {
			console.error("could not load server config", err);
			return;
		}

		const state = {
			config: {
				port: server_config.webserver_port || 3000,
				devLogs: false
			},
			server_config: null
		};

		state.server_config = server_config;

		wireguardHelper.checkServerKeys(state, state => {
			httpServer.initServer(state, () => {
				console.log(
					`WireGuard-Dashboard listening on port ${
						state.config.port
					}!`
				);
			});
		});
	});
}
*/


async function main () {
	await wireguardHelper.ensureInstalled()
	const server_config = await dataManager.loadServerConfig();

	let state = {
		config: {
			port: config.ENV.SERVER_PORT,
			devLogs: false
		},
		server_config: server_config
	};


	state = await wireguardHelper.checkServerKeys(state, state => {
		/*
		httpServer.initServer(state, () => {
			console.log(
				`WireGuard-Dashboard listening on port ${
					state.config.port
				}!`
			);
		});
	});*/
});


}

main()
	.then(console.log)
	.catch(console.error)
