
ENV = {
	WG_INTERFACE: process.env.WG_INTERFACE || "wg0",
	SERVER_CONFIG_DIR: process.env.SERVER_CONFIG_PATH || "config",
	SERVER_CONFIG_FILE: process.env.SERVER_CONFIG_FILE || "server_config.json",
	SERVER_PORT: parseInt(process.env.SERVER_PORT) || 3000
};

module.exports = {
	ENV: ENV,
	WG: "wg",
	WG_UP: `wg-quick up ${ENV.WG_INTERFACE}`,
	WG_DOWN: `wg-quick down ${ENV.WG_INTERFACE}`,
	WG_STATUS: `wg show`,
	WG_GENKEY: "wg genkey",
	/**
	 * @return {string}
	 */
	WG_PUBKEY: function (privateKey) {
		return `echo ${privateKey} | wg pubkey`
	},
	SERVER_CONFIG_PATH: ENV.SERVER_CONFIG_DIR + "/" + ENV.SERVER_CONFIG_FILE,
	DEFAULT_CONFIG: function(network_adapter, network_ip) {
		return {
			webserver_port: 3000,
			users: [],
			public_key: "",
			ip_address: network_ip,
			virtual_ip_address: "10.13.37.1",
			cidr: "24",
			port: "58210",
			dns: "1.1.1.1",
			network_adapter: network_adapter,
			config_path: "/etc/wireguard/wg0.conf",
			allowed_ips: ["0.0.0.0/0"],
			peers: [],
			private_traffic: false,
			dns_over_tls: true,
			tls_servername: "tls.cloudflare-dns.com",
		}
	}
};
