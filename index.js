module.exports = function (app) {
  var plugin = {};

  plugin.id = 'signalk-aisplus';
  plugin.name = 'AIS Plus';
  plugin.description = 'Store/retrieve persistent AIS info on friendly targets, also with alerting';

  var unsubscribes = [];
  var knownVessels = {};

  plugin.start = function (options, restartPlugin) {
    // Here we put our plugin logic
    app.debug('Plugin started');

    let localSubscription = {
      context: 'vessels.*',
      subscribe: [{
        path: 'navigation.*',
        period: '00*60*1000' // 60 second refresh
      }]
    }

    app.subscriptionmanager.subscribe(
      localSubscription,
      unsubscribes,
      subscriptionError => {
        app.console.error('Error:' + subscriptionError);
      },
      delta => processDelta(delta)
    );
  };


  plugin.stop = function () {
    // Here we put logic we need when the plugin stops
    unsubscribes.forEach(f => f());
    unsubscribes = [];

    app.debug('Plugin stopped');
  };

  plugin.schema = {
    // The plugin schema
  };

  function processDelta(data) {
    // Ignore self for now
    let myMmsi = app.getSelfPath('mmsi');
    let vessels = app.getPath('vessels');
    //app.debug(app.getPath('vessels'));
    //app.debug(app.getSelfPath('mmsi'));
    if(data.context == "vessels.urn:mrn:imo:mmsi:" + myMmsi) {
      return;
    }

    let context = data.contex
    app.debug("context: "+data.context);
    let mmsi = data.context.substring(8,data.context.length);
    app.debug(mmsi);

    data.updates.forEach(update => {
      update.values.forEach(value => {
        app.debug("Path: " +value.path + "Value: " + value.value);
        // Anything new here?
        if(value.path == "navigation.position") {
          //let savedVessel = knownVessels[data.context];

          let vessel = vessels.get("urn:mrn:imo:mmsi:"+mmsi);
          app.debug(vessel);

        } else {
          //app.console.error("Uknown path! " + value.path);
        }
      });
    });
  }

  return plugin;
};
