Package.describe({
  name: 'srarfian:pagination',
  summary: 'Meteor pagination done right. Usable in ReactJS or Blaze templates.',
  version: '1.2.6',
  git: 'https://github.com/develaparX/meteor-pagination.git',
  documentation: 'README.md',
});

Package.onUse((api) => {
  // Support Meteor 2.x and 3.x
  // Support Meteor 1.2.1+ through Meteor 3.x
  api.versionsFrom(['METEOR@1.2.1', 'METEOR@2.0', 'METEOR@3.0']);
  
  api.use([
    'ecmascript',
    'meteor-base',
    'check',
    'underscore',
    'mongo',
  ]);

  api.mainModule('server/pagination.js', 'server');

  api.use([
    'tracker',
    'reactive-var',
    'reactive-dict',
    'mongo',
  ], 'client');

  api.mainModule('client/pagination.js', 'client');
});
