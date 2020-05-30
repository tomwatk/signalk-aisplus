module.exports = function (app) {
  var plugin = {};

  plugin.id = 'signalk-aisplus';
  plugin.name = 'AIS Plus';
  plugin.description = 'Store/retrieve persistent AIS info on friendly targets, also with alerting';

  var unsubscribes = [];

  plugin.start = function (options, restartPlugin) {
    // Here we put our plugin logic
    app.debug('Plugin started');

    let localSubscription = {
      context: 'vessels.*',
      subscribe: [{
        path: '*',
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
    let dict = data.updates[0].values[0];
    let path = dict.path;
    let value = dict.value;

    app.debug("Delta: Path: " + path + "Value: " + value);
  }

  return plugin;
};
