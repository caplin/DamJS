define(["lib/react"], function (React) {
  function DamJSMatcher(matchString) {
    // Messages held by the filter, shown under "View". Each entry is
    // { direction, subject, type, getFields(), forward() }.
    this.heldMessages = [];
    this.matchString = matchString;
    this.reacts = [];
    this.filterIncoming = false;
    this.filterOutgoing = false;
    this.injectIncoming = false;
    this.injectOutgoing = false;
    this.logIncoming = false;
    this.logOutgoing = false;
    this.incomingInjectionFields = [{ fieldValue: "", keyValue: "" }];
    this.outgoingInjectionFields = [{ fieldValue: "", keyValue: "" }];
  }

  DamJSMatcher.prototype = {
    setReact: function (listener) {
      this.reacts.push(listener);
      this.updateReact();
    },
    clearReact: function (listener) {
      var listenerIndex = this.reacts.indexOf(listener);
      if (listenerIndex !== -1) {
        this.reacts.splice(listenerIndex, 1);
      }
    },
    updateReact: function () {
      this.reacts.forEach(
        function (react) {
          if (react._lifeCycleState !== "UNMOUNTED") {
            react.setState({ matches: this.heldMessages });
            react.setState({
              incomingInjectionFields: this.incomingInjectionFields,
            });
            react.setState({
              outgoingInjectionFields: this.outgoingInjectionFields,
            });
          }
        }.bind(this)
      );
    },
    toggleIncomingFilter: function () {
      this.filterIncoming = !this.filterIncoming;
      return this.filterIncoming;
    },
    toggleOutgoingFilter: function () {
      this.filterOutgoing = !this.filterOutgoing;
      return this.filterOutgoing;
    },
    isIncomingFiltered: function () {
      return this.filterIncoming;
    },
    isOutgoingFiltered: function () {
      return this.filterOutgoing;
    },
    toggleIncomingInjection: function () {
      this.injectIncoming = !this.injectIncoming;
      return this.injectIncoming;
    },
    toggleOutgoingInjection: function () {
      this.injectOutgoing = !this.injectOutgoing;
      return this.injectOutgoing;
    },
    isIncomingInjected: function () {
      return this.injectIncoming;
    },
    isOutgoingInjected: function () {
      return this.injectOutgoing;
    },
    toggleIncomingLogging: function () {
      this.logIncoming = !this.logIncoming;
      return this.logIncoming;
    },
    toggleOutgoingLogging: function () {
      this.logOutgoing = !this.logOutgoing;
      return this.logOutgoing;
    },
    isIncomingLogged: function () {
      return this.logIncoming;
    },
    isOutgoingLogged: function () {
      return this.logOutgoing;
    },
    addIncomingInjectionField: function () {
      this.incomingInjectionFields.push({});
      this.updateReact();
    },
    addOutgoingInjectionField: function () {
      this.outgoingInjectionFields.push({});
      this.updateReact();
    },
    updateIncomingInjectionValue: function (row, value) {
      this.incomingInjectionFields[row].fieldValue = value;
      this.updateReact();
    },
    updateIncomingInjectionKey: function (row, value) {
      this.incomingInjectionFields[row].keyValue = value;
      this.updateReact();
    },
    updateOutgoingInjectionValue: function (row, value) {
      this.outgoingInjectionFields[row].fieldValue = value;
      this.updateReact();
    },
    updateOutgoingInjectionKey: function (row, value) {
      this.outgoingInjectionFields[row].keyValue = value;
      this.updateReact();
    },
    matches: function (joinPoint) {
      function isIncoming() {
        if (joinPoint && joinPoint.target) {
          return joinPoint.target.getSubject;
        }
      }
      function isString() {
        return typeof joinPoint === "string";
      }
      if (isString()) {
        if (joinPoint.match(this.matchString)) {
          return true;
        }
      } else if (isIncoming()) {
        if (
          joinPoint &&
          joinPoint.target &&
          joinPoint.target.getSubject &&
          joinPoint.target.getSubject().match(this.matchString)
        ) {
          return true;
        }
      } else {
        if (
          joinPoint &&
          joinPoint.args &&
          joinPoint.args[0].match(this.matchString)
        ) {
          return true;
        }
      }

      return false;
    },
    /**
     * Holds an incoming update. The collection contains the join point for each
     * listener the update is fanned out to; forwarding proceeds all of them.
     */
    addJoinPoint: function (joinPointCollection) {
      var event = joinPointCollection[0].target;
      this.addHeldMessage({
        direction: "Incoming",
        subject: event.getSubject(),
        type: "",
        getFields: function () {
          return event._fields || event.getFields();
        },
        forward: function () {
          joinPointCollection.forEach(function (point) {
            point.proceed();
          });
        },
      });
    },
    /** Holds an outgoing packet (request, contrib, ...); forward() sends it. */
    addOutgoingPacket: function (packet, forward) {
      var type = packet.getType && packet.getType();
      this.addHeldMessage({
        direction: "Outgoing",
        subject: packet.getSubject ? packet.getSubject() : packet.subject,
        type: (type && (type.name || (type.getCode && type.getCode()))) || "",
        getFields: function () {
          var fields = {};
          (packet.fieldData || []).forEach(function (tuple) {
            fields[tuple.getX()] = tuple.getY();
          });
          return fields;
        },
        forward: forward,
      });
    },
    addHeldMessage: function (heldMessage) {
      heldMessage.matcher = this;
      this.heldMessages.push(heldMessage);
      this.updateReact();
    },
    forwardHeldMessage: function (heldMessage) {
      if (this.heldMessages.indexOf(heldMessage) === -1) {
        return;
      }
      this.removeHeldMessage(heldMessage);
      console.log(
        "Forwarding :",
        heldMessage.subject,
        JSON.parse(JSON.stringify(heldMessage.getFields()))
      );
      heldMessage.forward();
    },
    removeHeldMessage: function (heldMessage) {
      var index = this.heldMessages.indexOf(heldMessage);
      if (index !== -1) {
        this.heldMessages.splice(index, 1);
      }
      this.updateReact();
    },
  };

  return DamJSMatcher;
});
