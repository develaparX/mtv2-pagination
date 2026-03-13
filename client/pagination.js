import { _ } from 'meteor/underscore';
import { Meteor } from 'meteor/meteor';
import { ReactiveDict } from 'meteor/reactive-dict';
import { Tracker } from 'meteor/tracker';

// Support both Meteor 1.x (Meteor.Collection) and Meteor 2.x+ (Mongo.Collection)
const Collection = Mongo?.Collection || Meteor.Collection;

// Default limit for pagination
const DEFAULT_LIMIT = 10;

// Use WeakMap for automatic garbage collection when connections are closed
const Counts = new WeakMap();

function getSubscriptionCount(id, connection) {
  // Use connection object directly as WeakMap key
  if (!Counts.has(connection)) {
    Counts.set(connection, new Collection('pagination-counts', { connection }));
  }
  
  const countCollection = Counts.get(connection);
  const doc = countCollection.findOne(id);

  return (doc && doc.count) || 0;
}

class PaginationFactory {
  constructor(collection, settingsIn = {}) {
    if (!(this instanceof PaginationFactory)) {
      // eslint-disable-next-line max-len
      throw new Meteor.Error(4000, 'The Meteor.Pagination instance has to be initiated with `new`');
    }

    this.connection = settingsIn && settingsIn.connection ? settingsIn.connection : Meteor.connection;
    this.collection = collection;
    this.settings = new ReactiveDict();
    
    // Safe merge with prototype pollution protection
    const defaults = {
      name: collection._name,
      page: 1,
      perPage: 10,
      filters: {},
      fields: {},
      skip: 0,
      sort: { _id: 1 },
      reactive: true,
      debug: false
    };
    
    const settings = Object.assign({}, defaults);
    if (settingsIn && typeof settingsIn === 'object') {
      Object.keys(settingsIn).forEach(key => {
        // Prevent prototype pollution
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
          console.warn(`Pagination: Forbidden key "${key}" ignored in settings`);
          return;
        }
        settings[key] = settingsIn[key];
      });
    }

    this.settings.set('name', settings.name);

    if (!this.currentPage()) {
      this.currentPage(settings.page || 1);
    }

    if (!this.perPage()) {
      this.perPage(settings.perPage || DEFAULT_LIMIT);
    }

    if (!this.filters()) {
      this.filters(settings.filters);
    }

    if (!this.fields()) {
      this.fields(settings.fields);
    }

    if (this.skip() === undefined || this.skip() === null) {
      this.skip(settings.skip || 0);
    }

    if (!this.sort()) {
      this.sort(settings.sort);
    }

    if (!this.debug()) {
      this.debug(settings.debug);
    }

    this._activeObservers = {};
    this._computation = null;

    this._computation = Tracker.autorun(() => {
      const currentPage = this.currentPage() || 1;
      const perPage = this.perPage() || DEFAULT_LIMIT;
      const skip = this.skip() || 0;
      
      const options = {
        fields: this.fields(),
        sort: this.sort(),
        skip: (currentPage - 1) * perPage + skip,
        limit: perPage,
        reactive: settings.reactive
      };

      if (this.debug()) {
        console.log(
          'Pagination',
          this.settings.get('name'),
          options.reactive === false ? 'non-reactive' : 'reactive',
          'subscribe',
          JSON.stringify(this.filters()),
          JSON.stringify(options)
        );
        options.debug = true;
      }

      this.settings.get('resubscribe');

      this.settings.set('ready', false);

      this.subscription = this.connection.subscribe(
        this.settings.get('name'),
        this.filters(),
        options,
        () => {
          this.settings.set('ready', true);
        }
      );
    });
  }

  _checkObservers() {
    if (!Tracker.active) {
      return;
    }

    const currentComputationId = Tracker.currentComputation._id;

    if (this._activeObservers.hasOwnProperty(currentComputationId)) {
      return;
    }

    if (_.isEmpty(this._activeObservers) && !this.subscription) {
      this.settings.set('resubscribe', Date.now());
    }

    this._activeObservers[currentComputationId] = true;

    Tracker.currentComputation.onStop((c) => {
      // only mark the computation as stopped for future computations
      if (this._activeObservers[c._id] === true) {
        this._activeObservers[c._id] = false;
      }
    });

    Tracker.onInvalidate((c) => {
      // remove stopped computations
      _.each(this._activeObservers, (value, id) => {
        if (!value) {
          delete this._activeObservers[id];
        }
      });

      if (c.stopped && this._activeObservers.hasOwnProperty(c._id)) {
        delete this._activeObservers[c._id];

        // unsubscribe if all computations were stopped
        if (_.isEmpty(this._activeObservers)) {
          if (this.debug()) {
            console.log(
              'Pagination',
              this.settings.get('name'),
              'unsubscribe'
            );
          }

          if (this.subscription) {
            this.subscription.stop();

            this.subscription = null;
            this.settings.set('ready', false);
          }
        }
      }
    });
  }

  currentPage(page) {
    if (arguments.length === 1) {
      // Validate page - must be positive integer
      const validated = parseInt(page, 10);
      if (!isNaN(validated) && validated >= 1) {
        this.settings.set('page', validated);
      } else {
        console.warn('Pagination: Invalid page, must be positive integer');
      }
    } else {
      return this.settings.get('page');
    }
  }

  perPage(perPage) {
    if (arguments.length === 1) {
      // Validate perPage - must be positive integer
      const validated = parseInt(perPage, 10);
      if (!isNaN(validated) && validated >= 1) {
        this.settings.set('perPage', validated);
      } else {
        console.warn('Pagination: Invalid perPage, must be positive integer');
      }
    } else {
      return this.settings.get('perPage');
    }
  }

  filters(filters) {
    if (arguments.length === 1) {
      this.settings.set('filters', !_.isEmpty(filters) ? filters : {});
    } else {
      return this.settings.get('filters');
    }
  }

  fields(fields) {
    if (arguments.length === 1) {
      // Prevent prototype pollution in fields
      if (fields && typeof fields === 'object') {
        const safeFields = {};
        Object.keys(fields).forEach(key => {
          if (key !== '__proto__' && key !== 'constructor' && key !== 'prototype') {
            safeFields[key] = fields[key];
          }
        });
        this.settings.set('fields', safeFields);
      } else {
        this.settings.set('fields', fields);
      }
    } else {
      return this.settings.get('fields');
    }
  }

  skip(skip) {
    if (arguments.length === 1) {
      // Validate skip - must be non-negative integer
      const validated = parseInt(skip, 10);
      if (!isNaN(validated) && validated >= 0) {
        this.settings.set('skip', validated);
      } else {
        console.warn('Pagination: Invalid skip, must be non-negative integer');
      }
    } else {
      return this.settings.get('skip');
    }
  }

  sort(sort) {
    if (arguments.length === 1) {
      this.settings.set('sort', sort);
    } else {
      return this.settings.get('sort');
    }
  }

  totalItems() {
    return this.settings.get('totalItems');
  }

  totalPages() {
    const perPage = this.perPage();
    if (!perPage || perPage <= 0) {
      return 1;
    }
    const totalPages = this.totalItems() / perPage;
    return Math.ceil(totalPages || 1);
  }

  /**
   * Cleanup method to stop all subscriptions and computations.
   * Call this when component/template is destroyed to prevent memory leaks.
   */
  destroy() {
    if (this._computation) {
      this._computation.stop();
      this._computation = null;
    }
    if (this.subscription) {
      this.subscription.stop();
      this.subscription = null;
    }
    this._activeObservers = {};
    this.settings.set('ready', false);
  }

  ready() {
    this._checkObservers();

    return this.settings.get('ready');
  }

  debug(debug) {
    if (arguments.length === 1) {
      this.settings.set('debug', debug);
    } else {
      return this.settings.get('debug');
    }
  }

  refresh() {
    this.settings.set('resubscribe', Date.now());
  }

  getPage() {
    const query = {};

    if (!this.subscription || !this.subscription.subscriptionId) {
      // Trigger resubscribe if needed
      this.settings.get('resubscribe');
      return [];
    }

    if (this.ready()) {
      const totalItems = getSubscriptionCount(`sub_${this.subscription.subscriptionId}`, this.connection);
      this.settings.set('totalItems', totalItems);

      const currentPage = this.currentPage();
      const perPage = this.perPage();
      
      if (currentPage > 1 && totalItems <= perPage * currentPage) {
        // move to last page available
        this.currentPage(this.totalPages());
      }
    }

    query[`sub_${this.subscription.subscriptionId}`] = 1;

    const optionsFind = { fields: this.fields(), sort: this.sort() };

    if (this.debug()) {
      console.log(
        'Pagination',
        this.settings.get('name'),
        'find',
        JSON.stringify(query),
        JSON.stringify(optionsFind)
      );
      optionsFind.debug = true;
    }

    this._checkObservers();

    return this.collection.find(query, optionsFind).fetch();
  }
}

Meteor.Pagination = PaginationFactory;
