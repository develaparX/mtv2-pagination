Package.describe({
  name: 'srarfian:pagination',
  summary: 'Meteor pagination done right. Usable in ReactJS or Blaze templates.',
  version: '1.2.2',
  git: 'https://github.com/develaparX/mtv2-pagination.git',
  documentation: 'README.md',
});

Package.onUse((api) => {
  // Support Meteor 2.x and 3.x
  api.versionsFrom(['METEOR@2.0', 'METEOR@3.0']);
  
  api.use([
    'ecmascript',
    'meteor-base',
    'check',
    'underscore',
    'mongo@2.0.0',
  ]);

  api.mainModule('server/pagination.js', 'server');

  api.use([
    'tracker',
    'reactive-var',
    'reactive-dict',
    'mongo@2.0.0',
  ], 'client');

  api.mainModule('client/pagination.js', 'client');
});
