
ENV = {
	WG_CONFIG_FILE: process.env.WG_CONFIG_FILE || "wg0.conf",
	WG_VIRTUAL_IP: process.env.WG_VIRTUAL_IP || "10.13.13.1",
	WG_VIRTUAL_IP_CIDR: process.env.WG_VIRTUAL_IP_CIDR || "24",
	WG_DNS_SERVER: process.env.WG_DEFAULT_DNS || "1.1.1.1",
	WG_POST_UP: process.env.WG_POST_UP || "",
	WG_POST_DOWN: process.env.WG_POST_DOWN || "",
	WG_LISTEN_PORT: process.env.WG_LISTEN_PORT || "58210",
	WG_INTERFACE: process.env.WG_INTERFACE || "wg0",
	SERVER_CONFIG_DIR: process.env.SERVER_CONFIG_PATH || "config",
	SERVER_CONFIG_FILE: process.env.SERVER_CONFIG_FILE || "server_config.json",
	SERVER_PORT: parseInt(process.env.SERVER_PORT) || 3000,
	SERVER_ALLOWED_IPS: process.env.SERVER_ALLOWED_IPS || ["0.0.0.0/0"],
	SERVER_DNS_TLS: process.env.SERVER_DNS_TLS || false,
	SERVER_TLS_HOST: process.env.SERVER_TLS_HOST || "",
	SERVER_NETWORK_ADAPTER: process.env.SERVER_NETWORK_ADAPTER || null,
	SERVER_DEVELOPMENT: process.env.SERVER_DEVELOPMENT || false
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
			webserver_port: ENV.SERVER_PORT,
			users: [],
			public_key: "",
			ip_address: network_ip,
			virtual_ip_address: ENV.WG_VIRTUAL_IP,
			cidr: ENV.WG_VIRTUAL_IP_CIDR,
			port: ENV.WG_LISTEN_PORT,
			dns: ENV.WG_DNS_SERVER,
			network_adapter: network_adapter,
			config_path: ENV.WG_CONFIG_FILE,
			allowed_ips: ["0.0.0.0/0"],
			peers: [],
			private_traffic: false,
			dns_over_tls: true,
			tls_servername: "tls.cloudflare-dns.com",
		}
	}
};
