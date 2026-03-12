Package.describe({
  name: 'develapar:pagination',
  summary: 'Meteor pagination done right. Usable in ReactJS or Blaze templates.',
  version: '1.2.1',
  git: 'https://github.com/develapar/Pagination.git',
  documentation: 'README.md',
});

Package.onUse((api) => {
  api.versionsFrom(['METEOR@1.2.1', 'METEOR@2.0']);
  api.use([
    'ecmascript',
    'meteor-base',
    'check',
    'underscore',
    'mongo',
  ]);

  // Mongo.Collection is needed on client for count collection
  api.use([
    'mongo',
  ], 'client');

  api.mainModule('server/pagination.js', 'server');

  api.use([
    'tracker',
    'reactive-var',
    'reactive-dict',
    'mongo',
  ], 'client');

  api.mainModule('client/pagination.js', 'client');
});
