const express = require("express");
const morgan = require("morgan");
const nunjucks = require("nunjucks");
const session = require("express-session");
const bodyParser = require("body-parser");
const bcrypt = require("bcrypt");
const rateLimit = require("express-rate-limit");
const {cidr} = require("node-cidr");
const crypto = require("crypto");
const middlewares = require("./middleware");
const dataManager = require("./dataManager");
const wireguardHelper = require("./wgHelper");
const state = require("./state")();
const config = require("./config");
const utils = require("./utils");


exports.initServer = (cb) => {
	const app = express();
	app.use(morgan(config.ENV.SERVER_DEVELOPMENT ? "dev" : "combined"));
	app.use("/static", express.static("static"));
	app.use(express.json());
	app.use(bodyParser.urlencoded({ extended: true }));
	app.use(
		rateLimit({
			windowMs: 15 * 60 * 1000, // 15 minutes
			max: 1000000, // limit each IP to 100 requests per windowMs
		})
	);
	app.use(
		session({
			secret: crypto.randomBytes(48).toString("base64"),
			resave: true,
			saveUninitialized: true,
		})
	);

	nunjucks.configure(__dirname + "/views", {
		autoescape: true,
		watch: false,
		noCache: true,
		express: app,
	});

	app.get("/login", (req, res) => {
		if (state.server.users.length === 0) {
			res.redirect("/createuser");
			return;
		}

		res.render("login.njk");
	});

	app.get("/logout", (req, res) => {
		req.session.admin = false;
		res.redirect("/login");
	});

	app.get("/createuser", (req, res) => {
		const firstAccount = state.server.users.length === 0;
		res.render("setup_user.njk", {
			firstAccount: firstAccount,
		});
	});

	app.post("/api/createuser", (req, res) => {
		if (!req.body.username || !req.body.password) {
			res.status(500).send({
				msg: "USERNAME_AND_OR_PASSWORD_MISSING",
			});
			return;
		}

		if (req.body.password !== req.body.password_confirm) {
			res.status(500).send({
				msg: "PASSWORDS_DO_NOT_MATCH",
			});
			return;
		}

		if (state.server.users.length !== 0 && !req.session.admin) {
			res.status(401).send({
				msg: "FIRST_ACCOUNT_ALREADY_EXISTS",
			});
			return;
		}

		const hash = bcrypt.hashSync(req.body.password, 10);

		state.server.users.push({
			id: state.server.users.length + 1,
			username: req.body.username,
			password: hash,
		});

		dataManager.saveConfig({
			server: state.server
		});

		req.session.admin = true;
		res.status(200).send({
			msg: "OK",
		});

	});

	app.post("/api/login", (req, res) => {
		const userItem = state.server.users.find(
			el => el.username === req.body.username
		);

		if (!userItem) {
			res.status(404).send({
				msg: "USERNAME_OR_PASSWORD_WRONG_OR_NOT_FOUND",
			});
			return;
		}

		const hashCorrect = bcrypt.compareSync(req.body.password, userItem.password);
		if (!hashCorrect) {
			res.status(404).send({
				msg: "USERNAME_OR_PASSWORD_WRONG_OR_NOT_FOUND",
			});
			return;
		}

		req.session.admin = true;
		res.status(200).send({
			msg: "OK",
		});
	});

	// Authentication and Authorization Middleware
	// all routes below will only be accessible by logged in users
	//app.use(middlewares.ensureAuth);


	app.get("/", (req, res) => {
		res.render("dashboard.njk", {
			server: state.server,
			wg: Object.keys(state.wg)
				.filter(key => !["PrivateKey"].includes(key))
				.reduce((obj, key) => {
					obj[key] = state.wg[key];
					return obj;
				}, {})
		});
	});


	app.post("/api/peer", async (req, res) => {

		const ids = state.server.Peers.map(el => {
			return parseInt(el.id, 10);
		});

		const id = parseInt(Math.max(...ids) + 1, 10) || 0;


		if(!state.wg.Address){
			res.status(500).send({
				msg: "COULD_NOT_SAVE_CREATE_PEER_CONFIGURATION",
			});
			return;
		}


		let availableIPs = cidr.ips(state.wg.Address);

		availableIPs = availableIPs.filter(
			el => {
				return el !== state.wg.Address.split("/")[0] && // Filter away Server IP
					!state.server.Peers.map(x => x.Address).includes(el) // Filter away other Peer IPs
			}
		);

		if(availableIPs.length <= 0) {
			res.status(500).send({
				msg: "NO_AVAILABLE_PEER_IP_ADDRESS",
			});
			return;
		}

		const peerAddress = availableIPs[0];
		const { privateKey, publicKey } = await wireguardHelper.generateKeyPair();
		const peer = {
			id: id,
			Address: peerAddress,
			PublicKey: publicKey,
			PrivateKey: privateKey,
			Active: true,
			Device: state.server.Interface
		};

		state.server.Peers.push(peer);

		await dataManager.saveConfig({
			server: state.server,
			wg: state.wg
		});


		// TODO , add to config also
		if(!(await wireguardHelper.reload())){
			res.status(500).send({
				msg: "COULD_NOT_RELOAD_WIREGUARD_" + peer.Device,
			});
			return;
		}

		res.status(201).send({
			msg: "OK",
			id,
			public_key: peer.PublicKey,
			ip: peerAddress,
		});

	});

	app.put("/api/peer/:id", async (req, res) => {
		const id = req.params.id;

		if (!id) {
			res.status(404).send({
				msg: "NO_ID_PROVIDED_OR_FOUND",
			});
			return;
		}

		const peer = state.server.Peers.find(
			el => parseInt(el.id, 10) === parseInt(id, 10)
		);

		if (!peer) {
			res.status(404).send({
				msg: "PEER_NOT_FOUND",
			});
			return;
		}

		const ipValid = utils.ipCheck.test(req.body.virtual_ip);
		if (!ipValid) {
			res.status(500).send({
				msg: "PEER_VIRTUAL_IP_INVALID",
			});
			return;
		}

		const old_active = peer.Active;

		peer.Device = req.body.device;
		peer.Address = req.body.virtual_ip;
		peer.PublicKey = req.body.public_key;
		peer.Active = req.body.active;

		await dataManager.saveConfig({
			server: state.server,
			wg: state.wg
		});

		/*dataManager.saveBothConfigs(state.server_config, err => {
			if (err) {
				res.status(500).send({
					msg: err,
				});
				return;
			}

			if (old_active === false && peer.active === true) {
				wireguardHelper.addPeer(
					{
						allowed_ips: peer.virtual_ip,
						public_key: peer.public_key,
					},
					err => {
						if (err) {
							console.error(err);
							res.status(500).send({
								msg: "COULD_NOT_ADD_PEER_TO_wg0",
							});
							return;
						}

						res.send({
							msg: "OK",
						});
					}
				);
			} else if (old_active === true && peer.active === false) {
				wireguardHelper.deletePeer(
					{
						public_key: peer.public_key,
					},
					err => {
						if (err) {
							console.error(err);
							res.status(500).send({
								msg: "COULD_NOT_DELETE_PEER_FROM_wg0",
							});
							return;
						}

						res.send({
							msg: "OK",
						});
					}
				);
			} else {
				res.send({
					msg: "OK",
				});
			}
		});*/
	});

	app.delete("/api/peer/:id", (req, res) => {
		const id = req.params.id;

		if (!id) {
			res.status(404).send({
				msg: "NO_ID_PROVIDED_OR_FOUND",
			});
			return;
		}

		const itemIndex = state.server_config.peers.findIndex(
			el => parseInt(el.id, 10) === parseInt(id, 10)
		);

		if (itemIndex === -1) {
			res.status(404).send({
				msg: "PEER_NOT_FOUND",
			});
			return;
		}

		const public_key = state.server_config.peers[itemIndex].public_key;

		state.server_config.peers.splice(itemIndex, 1);

		dataManager.saveBothConfigs(state.server_config, err => {
			if (err) {
				console.error("DELETE /api/peer/:id", err);
				res.status(500).send({
					msg: "COULD_NOT_SAVE_CONFIGS",
				});
				return;
			}

			wireguardHelper.deletePeer(
				{
					public_key,
				},
				err => {
					if (err) {
						res.status(500).send({
							msg: "COULD_NOT_DELETE_PEER_FROM_wg0",
						});
						return;
					}

					res.send({
						msg: "OK",
					});
				}
			);
		});
	});

	app.put("/api/server_settings/save/allowed_ips", (req, res) => {
		if (!req.body) {
			res.status(400).send({
				msg: "ERROR_INPUT_MISSING",
				missing: "data",
			});
			return;
		}

		let validIPs = true;
		const _allowedIPs = req.body.allowed_ips.replace(/ /g, "").split(",");
		_allowedIPs.forEach(e => {
			const match = /^([0-9]{1,3}\.){3}[0-9]{1,3}(\/([0-9]|[1-2][0-9]|3[0-2]))$/.test(
				e
			);
			if (!match) {
				validIPs = false;
			}
		});

		if (!validIPs) {
			res.status(500).send({
				msg: "INVALID_IP_SETUP",
			});
			return;
		}

		state.server_config.allowed_ips = _allowedIPs;

		dataManager.saveServerConfig(state.server_config, err => {
			if (err) {
				res.status(500).send({
					msg: "COULD_NOT_SAVE_SERVER_CONFIG",
				});
				return;
			}

			res.send({
				msg: "OK",
			});
		});
	});

	app.put("/api/server_settings/save", async function(req, res){
		if (!req.body) {
			res.status(400).send({
				msg: "ERROR_INPUT_MISSING",
				missing: "data",
			});
			return;
		}



		const dnsValid = utils.ipCheck.test(req.body.dns);
		if (!dnsValid) {
			res.status(500).send({
				msg: "DNS_IP_INVALID",
			});
			return;
		}

		const virtualIPValid = utils.ipCheck.test(req.body.virtual_ip_address);
		if (!virtualIPValid) {
			res.status(500).send({
				msg: "VIRTUAL_ADDRESS_INVALID",
			});
			return;
		}

		const portValid = utils.portCheck.test(req.body.port);
		if (!portValid) {
			res.status(500).send({
				msg: "PORT_INVALID",
			});
			return;
		}

		state.server.IPAddress = req.body.ip_address;
		state.wg.Address = req.body.virtual_ip_address + "/" + req.body.cidr;
		state.wg.DNS = req.body.dns;
		state.server.Interface = req.body.network_adapter;
		state.server.WGConfigFile = req.body.config_path;
		state.server.DNSOverTLS = req.body.dns_over_tls;
		state.server.TLSServerHost = req.body.tls_servername;


		if((await utils.hasUFW())) {
			// disable old wireguard port
			if(!(await utils.disableUFW(state.wg.ListenPort))){
				winston.error("PUT /api/server_settings COULD_NOT_DISABLE_UFW_RULE");
				res.status(500).send({
					msg: "COULD_NOT_DISABLE_UFW_RULE",
				});
				return;
			}

			// enable new wireguard port
			if(!(await utils.enableUFW(req.body.port))){
				console.error("PUT /api/server_settings COULD_NOT_ENABLE_UFW_RULE");
				res.status(500).send({
					msg: "COULD_NOT_ENABLE_UFW_RULE",
				});
				return;
			}
		}

		// set new port in state
		state.wg.ListenPort = req.body.port;
		await dataManager.saveConfig({
			server: state.server,
			wg: state.wg
		});

		res.send({
			msg: "OK",
		});

	});

	app.get("/api/download/:id", (req, res) => {
		const id = req.params.id;

		if (!id) {
			res.status(400).send({
				msg: "NO_ID_PROVIDED_OR_FOUND",
			});
			return;
		}

		const item = state.server.Peers.find(
			el => parseInt(el.id, 10) === parseInt(id, 10)
		);

		if (!item) {
			res.status(404).send({
				msg: "PEER_NOT_FOUND",
			});
			return;
		}

		nunjucks.render(
			"templates/config_client.njk",
			{
				server_public_key: state.server.PublicKey,
				server_port: state.wg.ListenPort,
				allowed_ips: state.server.allowedIPs,
				client_ip_address: item.Address,
				dns: state.wg.DNS,
				client_private_key: item.PrivateKey,
				server_endpoint: state.wg.Address.split("/")[0],
				server_virtual_ip: state.wg.Address,
			},
			(err, renderedConfig) => {
				if (err) {
					console.error("/api/download/:id", id, item, err);
					res.status(500).send({
						err: "COULD_NOT_RENDER_CLIENT_CONFIG",
					});
					return;
				}

				const fileSuffix = item.device ? item.device : id;
				res.set(
					"Content-disposition",
					"attachment; filename=client_config_" + fileSuffix + ".conf"
				);
				res.set("Content-Type", "text/plain");
				res.send(renderedConfig);
			}
		);
	});

	app.post("/api/saveandrestart", async (req, res) => {

		if (!(await wireguardHelper.stopWireguard())) {
			res.status(500).send({
				msg: "COULD_NOT_STOP_WIREGUARD",
			});
			return;
		}

		await dataManager.saveConfig({
			server: state.server,
			wg: state.wg
		});

		if (!(await wireguardHelper.startWireguard())) {
			res.status(500).send({
				msg: "COULD_NOT_SAVE_WIREGUARD_CONFIG",
			});
			return;
		}

		res.status(201).send({
			msg: "OK",
		});

	});

	app.post("/api/getwireguardstatus", (req, res) => {
		wireguardHelper.wireguardStatus((err, stdout) => {
			if (err) {
				res.status(500).send({
					msg: err.toString(),
				});
				return;
			}

			res.status(201).send({
				msg: "OK",
				data: stdout,
			});
		});
	});

	app.post("/api/refreshserverkeys", (req, res) => {
		wireguardHelper.generateKeyPair((err, newPair) => {
			if (err) {
				res.status(500).send({
					msg: err.toString(),
				});
				return;
			}

			state.server_config.public_key = newPair.public_key;
			state.server_config.private_key = newPair.private_key;

			dataManager.saveServerConfig(state.server_config, err => {
				if (err) {
					res.status(500).send({
						msg: err,
					});
					return;
				}

				res.status(200).send({
					msg: "OK",
					public_key: newPair.public_key,
				});
			});
		});
	});

	app.put("/api/user/edit/:id", (req, res) => {
		const id = req.params.id;

		if (!id) {
			res.status(400).send({
				msg: "NO_ID_PROVIDED_OR_FOUND",
			});
			return;
		}

		const userItem = state.server_config.users.find(
			el => parseInt(el.id, 10) === parseInt(id, 10)
		);

		if (userItem) {
			const user = req.body.username;
			const pass = req.body.password;

			userItem.username = user;

			if (pass) {
				bcrypt.hash(pass, 10, (err, hash) => {
					if (err) {
						res.status(500).send({
							msg: err,
						});
						return;
					}

					userItem.password = hash;

					dataManager.saveServerConfig(state.server_config, err => {
						if (err) {
							res.status(500).send({
								msg: err,
							});
							return;
						}

						res.status(200).send({
							msg: "OK",
						});
					});
				});
			} else {
				dataManager.saveServerConfig(state.server_config, err => {
					if (err) {
						res.status(500).send({
							msg: err,
						});
						return;
					}

					res.status(200).send({
						msg: "OK",
					});
				});
			}
		} else {
			res.status(404).send({
				msg: "USER_NOT_FOUND",
			});
		}
	});

	app.delete("/api/user/delete/:id", (req, res) => {
		const id = req.params.id;

		if (!id) {
			res.status(400).send({
				msg: "NO_ID_PROVIDED_OR_FOUND",
			});
			return;
		}

		const userItemIndex = state.server_config.users.findIndex(
			el => parseInt(el.id, 10) === parseInt(id, 10)
		);

		if (userItemIndex !== -1) {
			if (state.server_config.users.length !== 1) {
				state.server_config.users.splice(userItemIndex, 1);

				dataManager.saveServerConfig(state.server_config, err => {
					if (err) {
						res.status(500).send({
							msg: err,
						});
						return;
					}

					res.status(200).send({
						msg: "OK",
					});
				});
			} else {
				res.status(500).send({
					msg: "CANNOT_DELETE_LAST_USER",
				});
			}
		} else {
			res.status(404).send({
				msg: "USER_NOT_FOUND",
			});
		}
	});

	app.post("/api/switchtrafficmode", (req, res) => {
		if (state.server_config.private_traffic) {
			wireguardHelper.makeDashboardPublic(state, err => {
				if (err) {
					res.status(500).send({
						msg: err.toString(),
					});
					return;
				}

				state.server_config.private_traffic = false;
				res.status(200).send({
					msg: "OK",
				});
			});
		} else {
			wireguardHelper.makeDashboardPrivate(state, err => {
				if (err) {
					res.status(500).send({
						msg: err.toString(),
					});
					return;
				}

				state.server_config.private_traffic = true;
				res.status(200).send({
					msg: "OK",
				});
			});
		}
	});

	app.listen(state.server.Port, cb)
};
