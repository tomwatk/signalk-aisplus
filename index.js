module.exports = function (app) {
  var plugin = {};
 
  plugin.id = 'signalk-aisplus';
  plugin.name = 'AIS Plus';
  plugin.description = 'Store/retrieve persistent AIS info on friendly targets, also with alerting';
 
  plugin.start = function (options, restartPlugin) {
    // Here we put our plugin logic
    app.debug('Plugin started');
  };
 
  plugin.stop = function () {
    // Here we put logic we need when the plugin stops
    app.debug('Plugin stopped');
  };
 
  plugin.schema = {
    // The plugin schema
  };
 
  return plugin;
};
