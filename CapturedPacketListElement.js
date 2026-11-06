define(['lib/react', 'CapturedPacketElement'], function(React, CapturedPacketElement) {
	return React.createClass({
		getInitialState: function() {
			return {
				matches: []
			}
		},
		componentWillReceiveProps: function(props) {
			if (this.props.matcher) {
				this.props.matcher.clearReact(this);
			}
			if (props.matcher) {
				props.matcher.setReact(this);
			}
		},
		componentDidMount: function() {
			this.props.matcher.setReact(this);
		},
		componentWillUnmount: function() {
			this.props.matcher.clearReact(this);
		},
		render: function() {
			var packetList = [];
			if (this.state.matches && this.state.matches.length > 0) {
				this.state.matches.forEach(function(heldMessage) {
					packetList.push(CapturedPacketElement({heldMessage: heldMessage}));
				})
				return React.DOM.div({style: columnStyle}, 
					React.DOM.button({onClick: this.props.back}, "Back"),
					packetList);
			}
			return React.DOM.button({onClick: this.props.back}, "Back");
		}
	});
});
