const state = require("./state")();




module.exports = {
	ensureAuth: (req, res, next) => {
		if (req.session && req.session.admin) {
			return next();
		}

		// check if a single user exists
		if (state.server.users.length === 0) {
			return res.redirect("/createuser");
		}

		return res.redirect("/login");
	}
};
