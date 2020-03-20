

class State {

	constructor() {
		if(!State.instance) {
			State.instance = this;
			this.server = {};
			this.config = {};
			this.wg = {}
		}

	}

	get(){
		return State.instance.data
	}

	getInstance(){
		if(!State.instance){
			State.instance = new State();
		}

		return State.instance;
	}
}


module.exports = function(){
	const state = new State().getInstance();
	return state
};
