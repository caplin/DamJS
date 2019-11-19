define(['lib/react'], function(React) {
	return React.createClass({
		getInitialState: function() {
			this.setFiltered();
			return this.getFilteredState()
		},
		componentWillReceiveProps: function(props) {
			this.setFiltered();
		},
		toggleFilter: function() {
			this.props.toggleFilter();
			this.setFiltered()
		},
		setFiltered: function() {
			this.setState(this.getFilteredState());
		},
		getFilteredState: function() {
			if (this.props.isFiltered())  {
				return {
					style: {backgroundColor: "lightgreen"},
					openOrFiltered: "On"
				};
			} else {
				return {
					style: {backgroundColor: "lightgrey"},
					openOrFiltered: "Off"
				};
			}
		},
		render: function() {
			return React.DOM.button({onClick: this.toggleFilter, style: this.state.style}, this.props.buttonLabel /* + " " +this.state.openOrFiltered*/);
		}
	})
});