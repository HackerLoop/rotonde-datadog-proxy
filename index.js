'use strict';

const _ = require('lodash');

const newClient = require('rotonde-client/node/rotonde-client');

const client = newClient('ws://rotonde:4224/');

let config
try {
  config = require('/etc/rotonde-datadog-proxy/config.json');
}
catch(err) {
  console.log(err);
  config = require('./config.json');
}

/*client.eventHandlers.attach('SMOKE_DETECTOR', (e) => {
  client.sendAction('DATADOG_EVENT', {
    title: 'Smoke Detector Triggered',
    text: 'Smoke detector in cooltainer just triggered an alarm.',
    options: {
      type: 'error',
    }
  });
});*/

if (!config.event_mappings) {
  console.log('no event_mappings configured');
  process.exit(1);
}

const mapToPacket = (from, to) => {
  // helper function to transform
  const toDataValue = (data, value) => {
    // json format specifies path as array for value key
    if (_.isArray(value)) {
      return _.reduce(value, (v, i) => v[i], data);
    }
    // simple key
    return  data[value];
  }

  const data = _.reduce(to.fields, (data, value, key) => {

    // constant string value (surrounded with ')
    if (value.indexOf("'") == 0 && value.lastIndexOf("'") == value.length-1) {
      // there is a template-like feature here, part of the string can be replaced by an event's data attribute, by placing an attribute name as {attribute}, or a path as {path,to,attribute}
      const replaces = value.match(/{([^}]+)}/g);
      if (replaces && replaces.length) {
        data[key] = _.reduce(replaces, (value, replace) => {
          const replaceTokens = replace.split(',');
          data[key] = value.replace('{' + replace + '}', toDataValue(from, replaceTokens));
          return data;
        }, value);
      } else {
        data[key] = value;
      }
      return data;
    }
    data[key] = toDataValue(from, value);
    return data;
  }, {});

  if (to.type == 'event') {
    client.sendEvent(to.identifier, data);
  } else {
    client.sendAction(to.identifier, data);
  }
}

client.onReady(() => {
  console.log('connected to rotonde !!!');

  // attach to all events in config.event_mappings
  _.forEach(config.event_mappings, (mapping) => {
    client.eventHandlers.attach(mapping.from, (e) => {
      _.forEach(mapping.to, (to) => {
        mapToPacket(e.data, to);
      });
    });
  });
});

client.connect();
