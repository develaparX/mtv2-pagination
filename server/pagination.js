import { _ } from 'meteor/underscore';
import { Meteor } from 'meteor/meteor';
import { check, Match } from 'meteor/check';

const countCollectionName = 'pagination-counts';

// Maximum documents per page (DoS protection)
const MAX_LIMIT = 1000;

// Default limit if not specified or invalid
const DEFAULT_LIMIT = 10;

// Forbidden MongoDB operators for security
const FORBIDDEN_OPERATORS = ['$where', '$eval', '$function'];

/**
 * Sanitize query to prevent NoSQL injection
 * Removes forbidden MongoDB operators recursively
 * Preserves Date, ObjectId, and other special MongoDB types
 */
function sanitizeQuery(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  
  // Preserve Date objects
  if (obj instanceof Date) {
    return obj;
  }
  
  // Preserve Mongo ObjectId (check for _str property or hex string pattern)
  if (obj._str || (typeof obj.toHexString === 'function')) {
    return obj;
  }
  
  // Preserve RegExp
  if (obj instanceof RegExp) {
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
  if (settings.countInterval > 60000) {
    settings.countInterval = 60000; // Max 1 minute
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
    
    // Enforce limit to prevent DoS (always set a default)
    if (options.limit) {
      options.limit = Math.min(parseInt(options.limit, 10), MAX_LIMIT);
      if (isNaN(options.limit) || options.limit < 1) {
        options.limit = DEFAULT_LIMIT;
      }
    } else {
      // If no limit provided, use default
      options.limit = DEFAULT_LIMIT;
    }
    
    // Validate sort option to prevent injection via sort operators
    if (options.sort && typeof options.sort === 'object') {
      // Check for dangerous keys in sort object
      for (const key of Object.keys(options.sort)) {
        if (FORBIDDEN_OPERATORS.includes(key)) {
          console.warn(`Pagination: Forbidden operator "${key}" removed from sort`);
          delete options.sort[key];
        }
      }
    }
    
    // Validate fields option to prevent injection
    if (options.fields && typeof options.fields === 'object') {
      for (const key of Object.keys(options.fields)) {
        if (FORBIDDEN_OPERATORS.includes(key)) {
          console.warn(`Pagination: Forbidden operator "${key}" removed from fields`);
          delete options.fields[key];
        }
      }
    }

    if (!_.isEmpty(sanitizedQuery)) {
      filters.push(sanitizedQuery);
    }

    // Sanitize server-side filters as well (defense in depth)
    if (!_.isEmpty(settings.filters)) {
      filters.push(sanitizeQuery(settings.filters));
    }

    let dynamic_filters;
    try {
      dynamic_filters = settings.dynamic_filters.call(self);
    } catch (err) {
      throw new Meteor.Error(4004, `dynamic_filters execution failed: ${err.message}`);
    }

    if (typeof dynamic_filters === 'object' && dynamic_filters !== null) {
      // Sanitize dynamic_filters to prevent injection
      const sanitizedDynamicFilters = sanitizeQuery(dynamic_filters);
      if (!_.isEmpty(sanitizedDynamicFilters)) {
        filters.push(sanitizedDynamicFilters);
      }
    } else {
      // eslint-disable-next-line max-len
      throw new Meteor.Error(4003, 'Invalid dynamic filters return type. Server side dynamic filters need to be a function that returns an object!');
    }

    if (typeof settings.transform_filters === 'function') {
      try {
        const transformed = settings.transform_filters.call(self, filters, options);
        // Validate that transform_filters returns an array
        if (Array.isArray(transformed)) {
          // Sanitize each filter in the array
          filters = transformed.map(sanitizeQuery);
        } else {
          console.warn('Pagination: transform_filters should return an array, using original filters');
        }
      } catch (err) {
        throw new Meteor.Error(4005, `transform_filters execution failed: ${err.message}`);
      }
    }

    if (typeof settings.transform_options === 'function') {
      try {
        options = settings.transform_options.call(self, filters, options);
        // Re-validate limit after transform_options (security: prevent removing limit)
        // Also ensure limit is always an integer
        options.limit = parseInt(options.limit, 10);
        if (isNaN(options.limit) || options.limit < 1 || options.limit > MAX_LIMIT) {
          options.limit = DEFAULT_LIMIT;
        }
        // Sanitize sort and fields if present after transform
        if (options.sort) options.sort = sanitizeQuery(options.sort);
        if (options.fields) options.fields = sanitizeQuery(options.fields);
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
      
      let count = 0;
      let docs = [];
      
      try {
        count = collection.find(findQuery, {fields: {_id: 1}}).count();
        docs = collection.find(findQuery, options).fetch();
      } catch (err) {
        console.error('Pagination: Error fetching non-reactive data:', err.message);
        self.error(new Meteor.Error(500, `Database error: ${err.message}`));
        return;
      }

      self.added(countCollectionName, subscriptionId, {count: count});

      _.each(docs, function(doc) {
        self.added(collection._name, doc._id, doc);
        self.changed(collection._name, doc._id, {[subscriptionId]: 1});
      });
      
      // Cleanup function for non-reactive mode (needed for proper subscription cleanup)
      self.onStop(() => {
        if (options.debug) {
          console.log('Pagination', settings.name, 'non-reactive subscription stopped');
        }
      });
    } else {
      const subscriptionId = `sub_${self._subscriptionId}`;
      const countCursor = collection.find(findQuery, {fields: {_id: 1}});

      self.added(countCollectionName, subscriptionId, {count: countCursor.count()});

      const updateCount = _.throttle(Meteor.bindEnvironment(()=> {
        self.changed(countCollectionName, subscriptionId, {count: countCursor.count()});
      }), 50, { trailing: true });
      const countTimer = Meteor.setInterval(function() {
        updateCount();
      }, settings.countInterval);
      let handle;
      try {
        handle = collection.find(findQuery, options).observeChanges({
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
      } catch (err) {
        console.error('Pagination: Error in observeChanges:', err.message);
        self.ready();
        return;
      }

      self.onStop(() => {
        Meteor.clearInterval(countTimer);
        if (handle) {
          handle.stop();
        }
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
