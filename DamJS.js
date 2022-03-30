function findPermissioningHandler() {
  for (var i in x) {
    if (
      x[i].messages[0].handler
        .getSubject()
        .indexOf("/PERMISSIONS/MASTER/CONTAINER") !== -1
    ) {
      return x[i].messages[0].handler;
    }
  }
}

function disableTrading() {
  var tempMessages = [];

  // tempMessages.push({
  // 	getSubject: function() {return "/PERMISSIONS/MASTER/USER/user2@caplin.com"},
  // 	getFields: function() {return {PERMISSION_NAMESPACE: "FX_CURRENCY_PAIR_TRADE_LIST", AUTH: "USDDKK~DENY,USDJPY~DENY,EURUSD~DENY", TYPE: "PERMISSION", VALUE: ".*"}},
  // 	getKey: function() {return "PERMISSION:.*:FX_CURRENCY_PAIR_TRADE_LIST"}
  // });

  function getStringReturner(string) {
    return function () {
      return string;
    };
  }

  function getFieldsReturner(permName, auth, type, value) {
    return function () {
      return {
        PERMISSION_NAMESPACE: permName,
        AUTH: auth,
        TYPE: type,
        VALUE: value,
      };
    };
  }

  var username = Object.keys(
    findPermissioningHandler().getSubscriptionListener()
      ._compositePermissionEngine.m_mEngines.MASTER.m_mUsers
  )[0];
  var perms =
    findPermissioningHandler().getSubscriptionListener()
      ._compositePermissionEngine.m_mEngines.MASTER.m_mUsers[username]
      .m_mPermissions;

  for (var permContext in perms) {
    //.*
    var permissions = perms[permContext].m_mPermissions;
    for (var permId in permissions) {
      //TRADE
      var permission = permissions[permId];

      //permission.m_mPermissions["EURUSD"] = "DENY"
      var auths = [];
      for (var key in permission.m_mPermissions) {
        auths.push(key + "~" + permission.m_mPermissions[key]);
      }
      //auths.push("EURUSD~DENY");

      tempMessages.push({
        getSubject: getStringReturner("/PERMISSIONS/MASTER/USER/" + username),
        getFields: getFieldsReturner(
          permission.m_sNamespace,
          auths.join(","),
          "PERMISSION",
          permContext
        ),
        getKey: getStringReturner("PERMISSION:" + permContext + ":" + permId),
        //getKey: function() {return "PERMISSION:.*:FX_CURRENCY_PAIR_TRADE_LIST"}
      });
    }
  }

  var messages = [];

  a = findPermissioningHandler();
  b = a.getSubscriptionListener();
  messages.push({
    getSubject: function () {
      return "/PERMISSIONS/MASTER/CONTROL/START";
    },
    getFields: function () {
      return { TXN_ID: "999" };
    },
    getKey: function () {
      return "TXN_ID";
    },
  });
  messages.push({
    getSubject: function () {
      return "/PERMISSIONS/MASTER/USER/" + username;
    },
    getFields: function () {
      return {
        PERMISSION_NAMESPACE: "",
        AUTH: "",
        TYPE: "ROW_COUNT",
        VALUE: "3",
      };
    },
    getKey: function () {
      return "ROW_COUNT";
    },
  });
  var parents = Object.keys(
    findPermissioningHandler().getSubscriptionListener()
      ._compositePermissionEngine.m_mEngines.MASTER.m_mUsers[username].m_mGroups
  ).join(",");
  messages.push({
    getSubject: function () {
      return "/PERMISSIONS/MASTER/USER/" + username;
    },
    getFields: function () {
      return {
        PERMISSION_NAMESPACE: "",
        AUTH: "",
        TYPE: "PARENTS",
        VALUE: parents,
      };
    },
    getKey: function () {
      return "PARENTS";
    },
  });
  for (var i = 0; i < tempMessages.length; i++) {
    messages.push(tempMessages[i]);
  }
  //e5 = {getSubject: function() {return "/PERMISSIONS/MASTER/USER/user2@caplin.com"}, getFields: function() {return {AUTH: "FX-TRADE~DENY", PERMISSION_NAMESPACE: "FX_TRADE", TYPE: "PERMISSION", VALUE: ".*"}}, getKey: function() {return "PERMISSION:.*:FX_TRADE"}}
  messages.push({
    getSubject: function () {
      return "/PERMISSIONS/MASTER/CONTROL/COMMIT";
    },
    getFields: function () {
      return { TXN_ID: "999" };
    },
    getKey: function () {
      return "TXN_ID";
    },
  });
  for (var i = 0; i < messages.length; i++) {
    b.onPermissionUpdate(a, messages[i]);
  }
}

function enableTrading() {
  alert("currently disabled");
}

define(["lib/react", "DamJSMatcher", "lib/meld"], function (
  React,
  DamJSMatcher,
  meld
) {
  function DamJS() {
    this.matchers = [];
    this.setListeners();
    this.react = null;
    this.previous = {
      didProceed: true,
      time: null,
      sequenceNum: null,
      collection: null,
    };
  }

  DamJS.prototype = {
    setReact: function (react) {
      this.react = react;
      this.updateReact();
    },
    clearReact: function () {
      this.react = null;
    },
    updateReact: function () {},
    addNewMatcher: function (matchString) {
      for (var i = 0; i < this.matchers.length; i++) {
        if (this.matchers[i].matchString == matchString) {
          return;
        }
      }
      this.matchers.push(new DamJSMatcher(matchString));
      this.update();
    },
    update: function () {
      if (this.listener) {
        this.listener();
      }
    },
    onUpdate: function (fn) {
      this.listener = fn;
    },
    alreadyExists: function (joinPoint) {
      if (
        joinPoint.target._timeReceived === this.previous.time &&
        this.previous.sequenceNum === joinPoint.target._rttpSequenceNumber
      ) {
        return true;
      } else {
        this.previous.time = joinPoint.target._timeReceived;
        this.previous.sequenceNum = joinPoint.target._rttpSequenceNumber;
        this.previous.collection = [joinPoint];
        return false;
      }
    },
    handleInjectIncoming: function (matcher, joinPoint) {
      matcher.incomingInjectionFields.forEach(function (injectionObj) {
        joinPoint.target._fields[injectionObj.keyValue] =
          injectionObj.fieldValue;
      });
    },
    handleInjectOutgoing: function (matcher, joinPoint) {
      matcher.incomingInjectionFields.forEach(function (injectionObj) {
        joinPoint.args[1][injectionObj.keyValue] = injectionObj.fieldValue;
      });
    },
    handleUpdate: function (joinPoint) {
      var proceed = true;
      if (!this.alreadyExists(joinPoint)) {
        this.matchers.forEach(
          function (matcher) {
            if (matcher.matches(joinPoint)) {
              if (matcher.injectIncoming) {
                this.handleInjectIncoming(matcher, joinPoint);
              }
              if (matcher.filterIncoming) {
                matcher.addJoinPoint(this.previous.collection);
                proceed = false;
              }
              if (matcher.logIncoming) {
                console.log(
                  "Incoming:",
                  joinPoint.target.getSubject(),
                  JSON.parse(JSON.stringify(joinPoint.target.getFields()))
                );
              }
            }
          }.bind(this)
        );
        this.previous.proceed = proceed;
        if (proceed) {
          joinPoint.proceed();
        }
      } else {
        this.previous.collection.push(joinPoint);
        if (this.previous.proceed) {
          joinPoint.proceed();
        }
      }
    },
    handlePublish: function (joinPoint) {
      var proceed = true;
      this.matchers.forEach(
        function (matcher) {
          if (matcher.matches(joinPoint)) {
            if (matcher.injectOutgoing) {
              this.handleInjectOutgoing(matcher, joinPoint);
            }
            if (matcher.filterOutgoing) {
              //matcher.addJoinPoint(joinPoint);
              proceed = false;
            }
            if (matcher.logOutgoing) {
              console.log("Outgoing:", joinPoint.args[0], joinPoint.args[1]);
            }
          }
        }.bind(this)
      );
      if (proceed) {
        joinPoint.proceed();
      }
    },
    handleSubscribe: function (joinPoint) {
      var proceed = true;
      this.matchers.forEach(
        function (matcher) {
          if (matcher.matches(joinPoint)) {
            if (matcher.injectOutgoing) {
              // this.handleInjectOutgoing(matcher, joinPoint);
            }
            if (matcher.logOutgoing) {
              console.log("Outgoing:", joinPoint.args[0], joinPoint.args[1]);
            }
          }
        }.bind(this)
      );
      if (proceed) {
        return joinPoint.proceed();
      }
    },
    setListeners: function () {
      if (window.caplin.streamlink) {
        meld.around(
          caplin.streamlink._streamLinkCore._subscriptionManager,
          "send",
          function (joinPoint) {
            var proceed = true;
            this.matchers.forEach(
              function (matcher) {
                if (matcher.matches(joinPoint.args[1].subject)) {
                  if (matcher.filterOutgoing) {
                    proceed = false;
                  }
                }
              }.bind(this)
            );
            if (proceed) {
              return joinPoint.proceed();
            }
          }.bind(this)
        );

        //				meld.around(
        //					caplin.streamlink.impl.subscription.SubscriptionManager.prototype, 'onUpdate', function(joinPoint) {
        //						if (typeof x == "undefined") {
        //							if (joinPoint.args[0] instanceof caplin.streamlink.impl.event.RecordType1EventImpl) {
        //								x = joinPoint;
        //								var subs = x.target.subscriptions.subscriptions;
        //								for (var key in subs) {
        //									this.addNewMatcher(subs[key].messages[0].handler._subject);
        //								}
        //							}
        //						}
        //						joinPoint.proceed();
        //					}.bind(this));

        meld.around(
          caplin.streamlink,
          "publishToSubject",
          function (joinPoint) {
            this.handlePublish(joinPoint);
          }.bind(this)
        );

        meld.around(
          caplin.streamlink._streamLinkCore._subscriptionManager,
          "onUpdate",
          function (joinPoint) {
            var event = joinPoint.args[0];
            var isRecordType1Event = event._getRttpCode().name === "6c";
            var isPermissionEvent = event._getRttpCode().name === "6k";
            if (isRecordType1Event || isPermissionEvent) {
              meld.around(
                event,
                "_publishSubscriptionResponse",
                function (joinPoint) {
                  this.handleUpdate(joinPoint);
                }.bind(this)
              );
            }
            joinPoint.proceed();
          }.bind(this)
        );

        meld.around(
          caplin.streamlink,
          "subscribe",
          function (joinPoint) {
            return this.handleSubscribe(joinPoint);
          }.bind(this)
        );
      }
    },
  };

  return DamJS;
});
