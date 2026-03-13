srarfian:pagination
=================

[![Meteor Compatible](https://img.shields.io/badge/meteor-1.2.1%20--%203.x-green.svg)](https://meteor.com)
[![Version](https://img.shields.io/badge/version-1.2.9-blue.svg)](https://atmospherejs.com/srarfian/pagination)

This is a **security-hardened fork** of [kurounin:pagination](https://atmospherejs.com/kurounin/pagination) focused on the **core pagination engine** with production-ready security protections.

Compatible with **Meteor 1.2.1+**, **Meteor 2.x**, and **Meteor 3.x**.

> 📦 **What's included?** Server-side publication (`publishPagination`) and client-side subscription management (`Meteor.Pagination`).
> 
> ❌ **What's NOT included?** UI components (paginator buttons, page numbers, etc.). For UI, use existing libraries like `kurounin:pagination-blaze` or build your own.


Features
--------

+ **Incremental subscriptions**. Downloads only what is needed, not the entire collection at once. Suitable for large datasets.
+ **Instant changes propagation**. Any document changes are instantly propagated, thanks to light-weight modifications of subscription mechanism.
+ **Easy integration**. The package works out of the box. Page changes are triggered by a single reactive dictionary variable.
+ **Multiple collections per page**. Each Pagination instance runs independently. You can even create multiple paginations for one collection on a single page.
+ **Lightweight core package**. This package only contains the core pagination logic (server publication + client subscription). UI components (paginator buttons/templates) need to be implemented separately or use existing libraries.
+ **Security hardened**. Built-in protections against NoSQL injection, prototype pollution, and DoS attacks.

# Installation

## Core Package (Required)
```meteor add srarfian:pagination```

> ⚠️ **Important**: This package only provides the **core pagination logic** (server-side publication and client-side subscription management). It does **NOT** include UI components (paginator buttons, page numbers, etc.).

## UI Components (Optional - Choose One)

Since this is a fork focused on the core pagination engine, you need to implement your own UI components or use existing libraries:

### Option 1: Using kurounin's UI packages (Recommended)
**For Blaze paginator:**
```bash
meteor add kurounin:pagination-blaze
```
Usage: `{{> defaultBootstrapPaginator pagination=templatePagination}}`

**For ReactJS paginator (Meteor 1.2):**
```bash
meteor add kurounin:pagination-reactjs
```

**For ReactJS paginator (Meteor 1.3+):**
```bash
npm i react-bootstrap-pagination
```

### Option 2: Build Your Own UI
You can create custom paginator components using the pagination instance methods:
- `pagination.currentPage()` - get/set current page
- `pagination.totalPages()` - get total number of pages
- `pagination.perPage()` - get/set items per page

See examples below for building custom paginators.

# Usage

In your collections file (e.g. lib/collections.js):
```js
import { Mongo } from 'meteor/mongo';

MyCollection = new Mongo.Collection('myCollectionName');
```

In your publications file (e.g. server/publications.js):
```js
import { publishPagination } from 'meteor/srarfian:pagination';

publishPagination(MyCollection);
```

Optionally you can provide a set of filters on the server-side or even dynamic filters, which can not be overridden.
There's also the option of providing a transformation filter function to validate the client filters (e.g. server/publications.js):
```js
publishPagination(MyCollection, {
    filters: {is_published: true},
    dynamic_filters: function () {
        return {user_id: this.userId};
    },
    transform_filters: function (filters, options) {
        // called after filters & dynamic_filters
        allowedKeys = ['_id', 'title'];

        const modifiedFilters = [];

        // filters is an array of the provided filters (client side filters & server side filters)
        for (let i = 0; i < filters.length; i++) {
            modifiedFilters[i] =  _.extend(
                _.pick(filters[i], allowedKeys),
                {user_id: this.userId}
            );
        }

        return modifiedFilters;
    },
    transform_options: function (filters, options) {
        const fields = { name: 1, email: 1 }
        if (Roles.userIsInRole(this.userId, 'admin')) {
            fields.deleted = 1;
        }
        options.fields = _.extend(fields, options.fields);
        return options;
    }
});

```

For Blaze template
--------------------------------------------------
In your template file (e.g. client/views/mylist.html):
```html
<template name="myList">
    <div>
        {{#if isReady}}
            <ul>
              {{#each documents}}
                  <li>Document #{{_id}}</li>
              {{/each}}
            </ul>
            {{> defaultBootstrapPaginator pagination=templatePagination limit=10 containerClass="text-center" onClick=clickEvent}}
        {{else}}
            Loading...
        {{/if}}
    </div>
</template>
```
**[kurounin:pagination-blaze](https://atmospherejs.com/kurounin/pagination-blaze) package is needed for paginator**


In your template javascript file (e.g. client/scripts/mylist.js):
```js
Template.myList.onCreated(function () {
    this.pagination = new Meteor.Pagination(MyCollection, {
        sort: {
            _id: -1
        }
    });
});

Template.myList.onDestroyed(function () {
    // Cleanup to prevent memory leaks
    this.pagination.destroy();
});

Template.myList.helpers({
    isReady: function () {
        return Template.instance().pagination.ready();
    },
    templatePagination: function () {
        return Template.instance().pagination;
    },
    documents: function () {
        return Template.instance().pagination.getPage();
    },
    // optional helper used to return a callback that should be executed before changing the page
    clickEvent: function() {
        return function(e, templateInstance, clickedPage) {
            e.preventDefault();
            console.log('Changing page from ', templateInstance.data.pagination.currentPage(), ' to ', clickedPage);
        };
    }
});
```

For ReactJS template
--------------------------------------------------
In your view file (e.g. client/views/mylist.jsx):
```jsx
class MyListPage extends React.Component {
    constructor(props) {
        super(props);
        this.pagination = new Meteor.Pagination(MyCollection);
    }

    componentWillUnmount() {
        // Cleanup to prevent memory leaks
        this.pagination.destroy();
    }

    render() {
        // ... render logic
    }
}
```
**For Meteor 1.2 [kurounin:pagination-reactjs](https://atmospherejs.com/kurounin/pagination-reactjs) package is needed for paginator**

**For Meteor 1.3+ [react-bootstrap-pagination](https://www.npmjs.com/package/react-bootstrap-pagination) npm package is needed for paginator**


# Demo Projects

You can check out [this example application in React](https://github.com/mgscreativa/kurounin-pagination-react-example) created by [mgscreativa](https://github.com/mgscreativa) for a working implementation example.


# Server Pagination settings available on init

* `name`: set the publication name (defaults to **collection name**; *needs to be unique, to not collide with other publications*)
* `filters`: provide a set of filters on the server-side, which can not be overridden (defaults to **{}**, meaning no filters)
* `dynamic_filters`: provide a function which returns additional filters to be applied (**this** is the publication; receives no other parameters)
* `transform_filters`: provide a function which returns the modified filters object to be applied (**this** is the publication; receives the current **filters** as an array containing the client & server defined filters and **options** as parameters)
* `transform_options`: provide a function which returns the modified options object to be applied (**this** is the publication; receives the current **filters** as an array containing the client & server defined filters and **options** as parameters)
* `countInterval`: set the interval in ms at which the subscription count is updated (defaults to **10000**, meaning every 10s)


# Client Pagination settings available on init

* `name`: set the subscription name (defaults to **collection name**; *needs to be identical with the server side publication name*)
* `page`: set the initial page, for example the page parameter from url (defaults to **1**)
* `perPage`: set the number of documents to be fetched per page (defaults to **10**)
* `skip`: set the number of documents that should be skipped when fetching a page (defaults to **0**)
* `filters`: filters to be applied to the subscription (defaults to **{}**, meaning no filters)
* `fields`: fields to be returned (defaults to **{}**, meaning all fields)
* `sort`: set the sorting for retrieved documents (defaults to **{_id: 1}**)
* `reactive`: set the subscription reactivity, allowing to only retrieve the initial results when set to false (defaults to **true**)
* `debug`: console logs the query and options used when performing the find (defaults to **false**)
* `connection`: the server connection that will manage this collection. Pass the return value of calling DDP.connect to specify a different server. (defaults to **Meteor.connection**)


# Client Pagination available methods

* `currentPage([int])`: get/set the current page
* `perPage([int])`: get/set the number of documents per page
* `skip([int])`: get/set the number of documents to skip
* `filters([Object])`: get/set the current filters
* `fields([Object])`: get/set the retrieved fields
* `sort([Object])`: get/set the sorting order
* `debug([boolean])`: get/set the debug
* `totalItems()`: get the total number of documents
* `totalPages()`: get the total number of pages
* `ready()`: checks if the subscription for the current page is ready
* `refresh()`: forcefully refreshes the subscription (useful for non-reactive subscriptions)
* `getPage()`: returns the documents for the current page
* `destroy()`: cleanup method to stop subscriptions and prevent memory leaks. Call this when component/template is destroyed (e.g., in `componentWillUnmount` for React or `onDestroyed` for Blaze)


# Blaze Paginator template

A Blaze template is provided to allow navigation through available pages:

In the template html file add the paginator
```html
{{> defaultBootstrapPaginator pagination=templatePagination onClick=clickEvent limit=10 containerClass="text-center"}}
```
Available template parameters are:
* `pagination`: pagination instance
* `limit`: the maximum number of page links to display
* `containerClass`: optional container class for the paginator
* `paginationClass`: optional class for the *ul* element (defaults to `pagination`)
* `itemClass`: optional class for the page links elements
* `wrapLinks`: if set to true page links will be wrapped in *li* elements (defaults to `true`)
* `onClick`: optional callback to be called when page link is clicked (default callback runs `e.preventDefault()`)


# ReactJS Paginator class

A ReactJS class is provided to allow navigation through available pages:

```js
<DefaultBootstrapPaginator pagination={this.pagination} limit={10} containerClass="text-center" />
```
Available class properties are:
* `pagination`: pagination instance
* `limit`: maximum number of page links to display (defaults to **10**)
* `containerClass`: optional container class for the paginator


# Security

This package includes enterprise-grade security protections against common vulnerabilities:

## NoSQL Injection Protection

All queries sanitized to remove dangerous MongoDB operators:
- **`$where`** - Prevents arbitrary JavaScript execution in queries
- **`$eval`** - Prevents server-side code execution
- **`$function`** - Prevents function execution

Sanitization applied to:
- Client queries (`query` parameter)
- Server-side filters (`settings.filters`)
- Dynamic filters (`dynamic_filters` return value)
- Transform filters results (`transform_filters` return array)
- Options (`options.sort`, `options.fields` via `transform_options`)

## Rate Limiting / DoS Protection

| Setting | Minimum | Maximum | Default |
|---------|---------|---------|---------|
| Documents per page | 1 | 1000 | 10 |
| Count update interval | 50ms | 60000ms | 10000ms |

Limits enforced at multiple layers:
- Client-side validation
- Server-side enforcement
- Post-transform validation (after `transform_options`)

## Prototype Pollution Protection

- Server settings: `Object.create(null)` for prototype-less objects
- Client settings: Forbidden key filtering (`__proto__`, `constructor`, `prototype`)
- Client fields: Additional prototype pollution protection in `fields()` method

## Error Handling

All errors properly propagated to client with descriptive messages:
- Error codes 4000-4006 for specific failure modes
- Database errors propagated via `self.error()`
- Transform function errors caught and reported

# Changelog

### 1.2.9 (2026-03-13) - Security Hardening Update

#### 🔴 Security Fixes
- **Client-side Query Sanitization**: Added `sanitizeClientQuery()` for defense-in-depth
- **Sort Validation**: Prototype pollution protection in client `sort()` method
- **Fields Protection**: Added FORBIDDEN_OPERATORS check in client `fields()` method
- **Server Sort/Fields**: Added prototype pollution keys check (`__proto__`, `constructor`, `prototype`)

#### 🟠 Stability Fixes
- **Race Condition Fix**: Added `isStopped` flag to prevent updates after subscription stop
- **Marker Cleanup**: Clean up subscription markers in non-reactive mode onStop
- **Transform Options Validation**: Validate `transform_options` returns object before using

### 1.2.8 (2026-03-13) - Security & Stability Release

#### 🔴 Security Fixes
- **NoSQL Injection Protection**: Removed dangerous MongoDB operators (`$where`, `$eval`, `$function`) from all query paths
- **Query Sanitization**: All filters (client query, `settings.filters`, `dynamic_filters`, `transform_filters` results) now sanitized
- **Options Sanitization**: `options.sort` and `options.fields` validated for forbidden operators
- **Transform Sanitization**: `transform_options` return values sanitized (sort, fields)
- **Transform Filters Sanitization**: Each filter in `transform_filters` return array individually sanitized
- **Prototype Pollution Protection**: Server settings use `Object.create(null)`, client filters forbidden keys
- **Limit Bypass Prevention**: Re-validate limit after `transform_options` execution
- **Rate Limiting**: Maximum 1000 documents per page, minimum 50ms count interval, maximum 60s count interval

#### 🟠 Stability Fixes
- **Error Handling**: Try-catch untuk `dynamic_filters`, `transform_filters`, `transform_options` execution
- **Database Error Handling**: Try-catch untuk `observeChanges` dan count cursor creation
- **Error Propagation**: Gunakan `self.error()` untuk propagate error ke client (reactive & non-reactive)
- **Type Preservation**: `sanitizeQuery` preservasi `Date`, `ObjectId`, `RegExp` objects
- **Memory Leak Fix**: WeakMap untuk `Counts` dengan automatic garbage collection
- **Non-Reactive Cleanup**: `self.onStop()` untuk non-reactive mode
- **Observer Cleanup**: `handle.stop()` dalam `self.onStop()` dengan null check
- **Throttle Fix**: `_.throttle` dengan `{ trailing: true }` untuk pastikan count terakhir ter-update

#### 🟡 Validation Fixes
- **Limit Validation**: Selalu default ke 10 jika undefined/invalid, parseInt untuk type coercion
- **Transform Filters Validation**: Validasi return array, filter null/undefined items
- **Transform Options Validation**: Re-validate limit setelah transform
- **countInterval Validation**: Clamp antara 50ms - 60000ms
- **Client currentPage Validation**: Harus positive integer
- **Client perPage Validation**: Harus positive integer  
- **Client skip Validation**: Harus non-negative integer

#### 🟢 Defensive Programming
- **Null Checks**: Check `subscription.subscriptionId` sebelum pakai
- **Undefined Handling**: Fallback values di Tracker.autorun untuk `currentPage`, `perPage`, `skip`
- **Initialization**: Default values dengan fallback untuk semua settings
- **Fields Protection**: Prototype pollution protection di client `fields()` method

#### 🔵 Code Quality
- **Dead Code Removal**: Hapus `connectionRegistry` dan `getConnectionId`
- **Constants**: Gunakan `DEFAULT_LIMIT` constant instead of hardcoded 10
- **Typo Fix**: "needs" → "need" di error messages
- **Error Codes**: Unique error codes (4000-4006) untuk berbagai error types

### 1.2.7
- See 1.2.8 changelog (security release)

#### Breaking Changes in 1.2.8

⚠️ **Maximum 1000 documents per page**: Server enforces hard limit. Override by modifying `MAX_LIMIT` constant in source if truly needed.

⚠️ **Forbidden operators blocked**: `$where`, `$eval`, `$function` operators are stripped from all queries. Use alternative query patterns.

⚠️ **Transform functions must return valid types**: 
- `transform_filters` must return an array
- `transform_options` sort/fields are sanitized after execution
- `dynamic_filters` must return an object (not null)

⚠️ **Stricter input validation**: 
- `perPage`, `currentPage` must be positive integers
- `skip` must be non-negative integer
- Invalid values are rejected with console warnings

### 1.2.6
- **Fixed**: Memory leak in server publication (`clearInterval` instead of `clearTimeout`)
- **Fixed**: Deprecated `Meteor.Collection` replaced with `Mongo.Collection`
- **Fixed**: `instanceof` check in constructor now uses correct class name
- **Added**: `destroy()` method for proper cleanup to prevent memory leaks
- **Added**: Division by zero protection in `totalPages()` method
- **Updated**: Meteor 2.x and 3.x compatibility
- **Fixed**: Connection handling for DDP connections

### Packages used as inspiration:

 * [alethes:pages](https://atmospherejs.com/alethes/pages) for pagination instantiation
 * [aida:pagination](https://atmospherejs.com/aida/pagination) for bootstrap paginator template
