define(['lib/react', 'CapturedPacketElementInfo'], function(React, CapturedPacketElementInfo) {
	return React.createClass({
		getInitialState: function() {
			return {
				infoShown: false,
				infoElement: React.DOM.div(null)
			}
		},
		toggleInfo: function() {
			if (this.state.infoShown) {
				this.setState({
					infoElement: React.DOM.div(null), 
					infoShown: false
				});
			} else {
				this.setState({
					infoElement: CapturedPacketElementInfo({heldMessage: this.props.heldMessage}), 
					infoShown: true
				});
			}
		},
		forwardJoinPoint: function() {
			this.props.heldMessage.matcher.forwardHeldMessage(this.props.heldMessage);
		},
		removeJoinPoint: function() {
			this.props.heldMessage.matcher.removeHeldMessage(this.props.heldMessage);
		},
		render: function() {
			var heldMessage = this.props.heldMessage;
			var label = heldMessage.subject + (heldMessage.direction === "Outgoing" ? " (" + (heldMessage.type || "outgoing") + ")" : "");
			var subjectElement = React.DOM.span(null, label)
			return React.DOM.div(null, subjectElement, 
				React.DOM.button({onClick: this.forwardJoinPoint}, "Forward"), 
				React.DOM.button({onClick: this.removeJoinPoint}, "Remove"), 
				React.DOM.button({onClick: this.toggleInfo}, "Info"),
				this.state.infoElement);
		}
	});
});