import { _ } from 'meteor/underscore';
import { Meteor } from 'meteor/meteor';
import { check, Match } from 'meteor/check';

const countCollectionName = 'pagination-counts';

// Maximum documents per page (DoS protection)
const MAX_LIMIT = 1000;

// Forbidden MongoDB operators for security
const FORBIDDEN_OPERATORS = ['$where', '$eval', '$function'];

/**
 * Sanitize query to prevent NoSQL injection
 * Removes forbidden MongoDB operators recursively
 */
function sanitizeQuery(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(sanitizeQuery);
  }
  
  const sanitized = {};
  for (const key of Object.keys(obj)) {
    // Check for forbidden operators
    if (FORBIDDEN_OPERATORS.includes(key)) {
      console.warn(`Pagination: Forbidden operator "${key}" removed from query`);
      continue;
    }
    
    // Recursively sanitize nested objects
    sanitized[key] = sanitizeQuery(obj[key]);
  }
  return sanitized;
}

/**
 * Sanitize settings key to prevent prototype pollution
 */
function sanitizeKey(key) {
  if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
    console.warn(`Pagination: Forbidden key "${key}" removed from settings`);
    return null;
  }
  return key;
}

export function publishPagination(collection, settingsIn) {
  // Use Object.create(null) to prevent prototype pollution
  const settings = Object.create(null);
  
  // Safe extend with key sanitization
  const defaults = {
    name: collection._name,
    filters: {},
    dynamic_filters() {
      return {};
    },
    countInterval: 10000,
  };
  
  // Copy defaults
  Object.keys(defaults).forEach(key => {
    settings[key] = defaults[key];
  });
  
  // Copy settingsIn with sanitization
  if (settingsIn && typeof settingsIn === 'object') {
    Object.keys(settingsIn).forEach(key => {
      const safeKey = sanitizeKey(key);
      if (safeKey) {
        settings[safeKey] = settingsIn[key];
      }
    });
  }

  if (typeof settings.filters !== 'object') {
    // eslint-disable-next-line max-len
    throw new Meteor.Error(4001, 'Invalid filters provided. Server side filters need to be an object!');
  }

  if (typeof settings.dynamic_filters !== 'function') {
    // eslint-disable-next-line max-len
    throw new Meteor.Error(4002, 'Invalid dynamic filters provided. Server side dynamic filters need to be a function!');
  }

  if (settings.countInterval < 50) {
    settings.countInterval = 50;
  }

  Meteor.publish(settings.name, function addPub(query = {}, optionsInput = {}) {
    check(query, Match.Optional(Object));
    check(optionsInput, Match.Optional(Object));

    const self = this;
    let options = optionsInput || {};
    let findQuery = {};
    let filters = [];
    
    // Sanitize query to prevent NoSQL injection
    const sanitizedQuery = sanitizeQuery(query || {});
    
    // Enforce limit to prevent DoS
    if (options.limit) {
      options.limit = Math.min(parseInt(options.limit, 10), MAX_LIMIT);
      if (isNaN(options.limit) || options.limit < 1) {
        options.limit = 10; // Default fallback
      }
    }

    if (!_.isEmpty(sanitizedQuery)) {
      filters.push(sanitizedQuery);
    }

    if (!_.isEmpty(settings.filters)) {
      filters.push(settings.filters);
    }

    let dynamic_filters;
    try {
      dynamic_filters = settings.dynamic_filters.call(self);
    } catch (err) {
      throw new Meteor.Error(4004, `dynamic_filters execution failed: ${err.message}`);
    }

    if (typeof dynamic_filters === 'object' && dynamic_filters !== null) {
      if (!_.isEmpty(dynamic_filters)) {
        filters.push(dynamic_filters);
      }
    } else {
      // eslint-disable-next-line max-len
      throw new Meteor.Error(4003, 'Invalid dynamic filters return type. Server side dynamic filters need to be a function that returns an object!');
    }

    if (typeof settings.transform_filters === 'function') {
      try {
        filters = settings.transform_filters.call(self, filters, options);
      } catch (err) {
        throw new Meteor.Error(4005, `transform_filters execution failed: ${err.message}`);
      }
    }

    if (typeof settings.transform_options === 'function') {
      try {
        options = settings.transform_options.call(self, filters, options);
      } catch (err) {
        throw new Meteor.Error(4006, `transform_options execution failed: ${err.message}`);
      }
    }

    if (filters.length > 0) {
      if (filters.length > 1) {
        findQuery.$and = filters;
      } else {
        findQuery = filters[0];
      }
    }

    if (options.debug) {
      console.log(
        'Pagination',
        settings.name,
        options.reactive ? `reactive (counting every ${settings.countInterval}ms)` : 'non-reactive',
        'publish',
        JSON.stringify(findQuery),
        JSON.stringify(options)
      );
    }

    if (!options.reactive) {
      const subscriptionId = `sub_${self._subscriptionId}`;
      const count = collection.find(findQuery, {fields: {_id: 1}}).count();
      const docs = collection.find(findQuery, options).fetch();

      self.added(countCollectionName, subscriptionId, {count: count});

      _.each(docs, function(doc) {
        self.added(collection._name, doc._id, doc);

        self.changed(collection._name, doc._id, {[subscriptionId]: 1});
      });
    } else {
      const subscriptionId = `sub_${self._subscriptionId}`;
      const countCursor = collection.find(findQuery, {fields: {_id: 1}});

      self.added(countCollectionName, subscriptionId, {count: countCursor.count()});

      const updateCount = _.throttle(Meteor.bindEnvironment(()=> {
        self.changed(countCollectionName, subscriptionId, {count: countCursor.count()});
      }), 50);
      const countTimer = Meteor.setInterval(function() {
        updateCount();
      }, settings.countInterval);
      const handle = collection.find(findQuery, options).observeChanges({
        added(id, fields) {
          self.added(collection._name, id, fields);

          self.changed(collection._name, id, {[subscriptionId]: 1});
          updateCount();
        },
        changed(id, fields) {
          self.changed(collection._name, id, fields);
        },
        removed(id) {
          self.removed(collection._name, id);
          updateCount();
        }
      });

      self.onStop(() => {
        Meteor.clearInterval(countTimer);
        handle.stop();
      });
    }

    self.ready();
  });
}

class PaginationFactory {
  constructor(collection, settingsIn) {
    // eslint-disable-next-line max-len
    console.warn('Deprecated use of Meteor.Pagination. On server-side use publishPagination() function.');

    publishPagination(collection, settingsIn);
  }
}

Meteor.Pagination = PaginationFactory;
