
const util = require("util");
const child_process = require("child_process");
const exec = util.promisify(child_process.exec);
const spawn = util.promisify(child_process.spawn);

const winston = require('winston');
const config = require("./config");
const console = new winston.transports.Console();
const files = new winston.transports.File({ filename: 'combined.log' });
module.exports = {

	removeDuplicates: (array, key) => {
		let lookup = new Set();
		return array.filter(obj => !lookup.has(obj[key]) && lookup.add(obj[key]));
	},

	setupLogging: async function() {
		winston.level = config.ENV.LOGGING;
		winston.add(console);
		winston.add(files)
	},
	hasUFW: async function(){
		try{
			await exec(config.UFW);
			winston.debug("UFW is detected.");
			return true;
		}
		catch (e) {
			winston.debug("UFW is not installed!");
			return false;
		}

	},
	enableUFW: async function(port){
		const { stderr } = await exec(config.UFW_ADD(port));
		if (stderr) {
			winston.error("Could not enable port: ", port);
			return false;
		}
		winston.debug("Enabled port in UFW: ", port);
		return true;
	},
	disableUFW: async function(port){
		const { stderr } = await exec(config.UFW_DELETE(port));
		if (stderr) {
			winston.error("Could not disable port: ", port);
			return false;
		}
		winston.debug("disabled port in UFW: ", port);
		return true;
	},

	ipCheck: new RegExp(/^(([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])\.){3}([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])$/),
	portCheck: new RegExp(/^()([1-9]|[1-5]?[0-9]{2,4}|6[1-4][0-9]{3}|65[1-4][0-9]{2}|655[1-2][0-9]|6553[1-5])$/)


};
