/*
 * Copyright 2020 Tom Watkins <tom@tomwatkins.co.uk>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const fs = require('fs');
const sqlite3 = require('sqlite3');
const filePath = require('path');

module.exports = function (app) {
  var plugin = {};

  plugin.id = 'signalk-aisplus';
  plugin.name = 'AIS Plus';
  plugin.description = 'Store/retrieve persistent AIS info on friendly targets, also with alerting';

  var unsubscribes = [];
  var knownVessels = {};

  var dbFile;

  plugin.start = function (options, restartPlugin) {
    // Here we put our plugin logic
    app.debug('Plugin started, saving to ' + app.getDataDirPath());

    dbFile = filePath.join(app.getDataDirPath(), 'aisplus.sqlite3');
    db = new sqlite3.Database(dbFile);
    db.run('CREATE TABLE IF NOT EXISTS vessel('+
      'mmsi TEXT,'+
      'lastUpdate INTEGER,'+
      'name TEXT,'+
      'lastLat FLOAT,'+
      'lastLong FLOAT,'+
      'lastSpeed FLOAT,'+
      'lastCog FLOAT,'+
      'headingTrue FLOAT,'+
      'shipTypeId INTEGER,'+
      'shipTypeName TEXT,'+
      'lengthOverall INTEGER,'+
      'beam INTEGER,'+
      'aisFromBow INTEGER,'+
      'aisFromCenter INTEGER,'+
      'aisClass INTEGER,'+
      'callSign TEXT,'+
      'PRIMARY KEY (mmsi)'+
      ')'
      );

      db.run('CREATE TABLE IF NOT EXISTS vessel_history('+
        'mmsi TEXT,'+
        'ts INTEGER,'+
        'lat FLOAT,'+
        'long FLOAT,'+
        'speed FLOAT,'+
        'cog FLOAT,'+
        'PRIMARY KEY (mmsi, ts)'+
        ')'
        );

      db.run('CREATE INDEX IF NOT EXISTS idx_vessel_history ON vessel_history(mmsi)');
      db.run('CREATE INDEX IF NOT EXISTS idx_vessel ON vessel(name)');

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
    db.close();
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

    let context = data.context;
    let mmsiUrn = context.substring(8,context.length);

    let dict = data.updates[0].values[0];
    let path = dict.path;
    let value = dict.value;
    //app.debug("Path: " +path + " Value: " + value);
    // Anything new here?
    if(path == "navigation.position") {
      //let savedVessel = knownVessels[data.context];
      app.debug("Path: " +path + " Value: " + value);

      let vessel = vessels[mmsiUrn];
      app.debug(vessel);
      addOrUpdateVessel(vessel)
    } else {
      //app.console.error("Uknown path! " + value.path);
    }
  }

  function addOrUpdateVessel(vessel) {
    let newVessel = false;

    db.all('SELECT * FROM vessel WHERE mmsi = ?', vessel.mmsi, function(err, data) {
      let vesselValues = [];
      let historyValues = [];
      let distSinceLastUpdate = 0;

      vesselValues[0] = vessel.mmsi;
      historyValues[0] = vessel.mmsi;

      vesselValues[1] = vessel.name;
      if(vessel.navigation) {
        if(vessel.navigation.position) {
          vesselValues[2] = vessel.navigation.position.value.latitude;
          vesselValues[3] = vessel.navigation.position.value.latitude;
          vesselValues[4] = vessel.navigation.position.value.longitude;
          historyValues[1] = vessel.navigation.position.value.latitude;
          historyValues[2] = vessel.navigation.position.value.longitude;
        }
        if(vessel.navigation.speedOverGround) {
          vesselValues[5] = vessel.navigation.speedOverGround.value;
          historyValues[3] = vessel.navigation.speedOverGround.value;
        }
        if(vessel.navigation.courseOverGroundTrue) {
          vesselValues[6] = vessel.navigation.courseOverGroundTrue.value;
          historyValues[4] = vessel.navigation.courseOverGroundTrue.value;
        }
        if(vessel.navigation.headingTrue) {
          vesselValues[7] = vessel.navigation.headingTrue.value;
        }
      }
      if(vessel.design) {
        if(vessel.design.aisShipType) {
        vesselValues[8] = vessel.design.aisShipType.value.id;
        vesselValues[9] = vessel.design.aisShipType.value.name;
        }
        if(vessel.design.length) {
          vesselValues[10] = vessel.design.length.value.overall;
        }
        if(vessel.design.beam) {
          vesselValues[11] = vessel.design.beam.value;
        }
      }
      if(vessel.sensors && vessel.sensors.ais) {
        if(vessel.sensors.ais.fromBow) {
        vesselValues[12] = vessel.sensors.ais.fromBow.value;
        }
        if(vessel.sensors.ais.fromCenter) {
          vesselValues[13] = vessel.sensors.ais.fromCenter.value;
        }
        if(vessel.sensors.ais.class) {
          vesselValues[14] = vessel.sensors.ais.class.value;
        }
      }
      if(vessel.communication) {
        vesselValues[15] = vessel.communication.callsignVhf;
      }

      if(data.length == 0) {
        newVessel = true;
        // Store new vessel entry
        db.run('INSERT INTO vessel VALUES(?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', vesselValues);

        db.run('INSERT INTO vessel_history VALUES(?, CURRENT_TIMESTAMP, ?, ?, ?, ?)', historyValues);
      } else {
        let updatesDebug = '';

        // Update last position and update any fields necessary
        let storedVessel = data[0];
        if(vessel.navigation && vessel.navigation.position) {
          distSinceLastUpdate = calculateDistance(
            storedVessel.lastLat,
            storedVessel.lastLong,
            vessel.navigation.position.value.latitude,
            vessel.navigation.position.value.longitude);

          app.debug("Seen this vessel before, distance travelled: " + distSinceLastUpdate);
          // Update nav info if vessel has moved
          if(distSinceLastUpdate > 0.5) {
              let navValues=[
                vessel.navigation.position.value.latitude || null,
                vessel.navigation.position.value.longitude || null,
                vessel.navigation.speedOverGround.value || null,
                vessel.navigation.courseOverGroundTrue.value || null,
                null,
                vessel.mmsi
              ];
              if(vessel.navigation.headingTrue && vessel.navigation.headingTrue.value) {
                navValues[4] = vessel.navigation.headingTrue.value;
              }
              db.run('UPDATE vessel SET lastUpdate=CURRENT_TIMESTAMP, lastLat=?, lastLong=?, lastSpeed=?, lastCog=?, headingTrue=? WHERE mmsi=?', navValues);

              db.run('INSERT INTO vessel_history VALUES(?, CURRENT_TIMESTAMP, ?, ?, ?, ?)', historyValues);
              updatesDebug += 'Navigation values, ';
          }
          // Update vessel info if we have more than currently stored
          if(!storedVessel.name && vessel.name) {
            db.run('UPDATE vessel SET name=? WHERE mmsi=?',
              [vessel.name, vessel.mmsi]);
            updatesDebug += 'Vessel name, ';
          }
          if(!storedVessel.shipTypeId &&
            vessel.design &&
            vessel.design.aisShipType) {

            db.run('UPDATE vessel SET shipTypeId=?, shipTypeName=? WHERE mmsi=?',
              [vessel.design.aisShipType.value.id, vessel.design.aisShipType.value.name, vessel.mmsi]);
            updatesDebug += 'Ship type values, ';
          }

          if((!storedVessel.lengthOverall || !storedVessel.beam) &&
            vessel.design &&
            vessel.design.length &&
            vessel.design.beam) {

            db.run('UPDATE vessel SET lengthOverall=?, beam=? WHERE mmsi=?',
              [vessel.design.length, vessel.design.beam, vessel.mmsi]);
            updatesDebug += 'Vessel design values, ';
          }

          if((!storedVessel.aisFromBow || !storedVessel.aisFromCenter) &&
            vessel.sensors &&
            vessel.sensors.ais &&
            vessel.sensors.ais.fromBow &&
            vessel.sensors.ais.fromCenter &&
            vessel.sensors.ais.class) {

            db.run('UPDATE vessel SET aisFromBow=?, aisFromCenter=?, aisClass=? WHERE mmsi=?',
              [vessel.sensors.ais.fromBow.value, vessel.sensors.ais.fromCenter.value, vessel.sensors.ais.class.value, vessel.mmsi]);
            updatesDebug += 'AIS parameters, ';
          }

          if(!storedVessel.callSign &&
            vessel.communication &&
            vessel.communication.callsignVhf) {

            db.run('UPDATE vessel SET callSign=? WHERE mmsi=?', [vessel.communication.callsignVhf, vessel.mmsi]);
            updatesDebug += 'Callsign, ';
          }
        }

        app.debug("Updated the following values in DB: " + updatesDebug);
      }
    });
  }

  // Calculate distance in nautical miles
  function calculateDistance(lat1, lon1, lat2, lon2) {
    if ((lat1 == lat2) && (lon1 == lon2)) {
      return 0;
    }
    else {
      var radlat1 = Math.PI * lat1/180;
      var radlat2 = Math.PI * lat2/180;
      var theta = lon1-lon2;
      var radtheta = Math.PI * theta/180;
      var dist = Math.sin(radlat1) * Math.sin(radlat2) + Math.cos(radlat1) * Math.cos(radlat2) * Math.cos(radtheta);
      if (dist > 1) {
          dist = 1;
      }
      dist = Math.acos(dist);
      dist = dist * 180/Math.PI;
      dist = dist * 60 * 1.1515;
      dist = dist * 0.8684; // Convert to Nautical miles
      return dist;
    }
  }

  return plugin;
};
