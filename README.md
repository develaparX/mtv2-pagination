srarfian:pagination
=================

[![Meteor Compatible](https://img.shields.io/badge/meteor-1.2.1%20--%203.x-green.svg)](https://meteor.com)
[![Version](https://img.shields.io/badge/version-1.3.0-blue.svg)](https://atmospherejs.com/srarfian/pagination)

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
        const allowedKeys = ['_id', 'title'];
        const modifiedFilters = [];
        for (let i = 0; i < filters.length; i++) {
            modifiedFilters[i] = _.extend(
                _.pick(filters[i], allowedKeys),
                {user_id: this.userId}
            );
        }
        return modifiedFilters;
    },
    transform_options: function (filters, options) {
        const fields = { name: 1, email: 1 };
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

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `name` | String | collection._name | Publication name (must be unique) |
| `filters` | Object | `{}` | Server-side filters that cannot be overridden |
| `dynamic_filters` | Function | `() => {}` | Function returning additional filters (`this` is publication context) |
| `transform_filters` | Function | - | Transform filters array before query |
| `transform_options` | Function | - | Transform options object before query |
| `countInterval` | Number | 10000 | Count update interval in ms (min: 50, max: 60000) |


# Client Pagination settings available on init

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `name` | String | collection._name | Subscription name (must match server publication) |
| `page` | Number | 1 | Initial page number |
| `perPage` | Number | 10 | Documents per page (max: 1000) |
| `skip` | Number | 0 | Additional documents to skip (max: 100000) |
| `filters` | Object | `{}` | Query filters |
| `fields` | Object | `{}` | Fields to return |
| `sort` | Object | `{ _id: 1 }` | Sort order |
| `reactive` | Boolean | true | Enable reactive updates |
| `debug` | Boolean | false | Enable debug logging |
| `connection` | Object | Meteor.connection | DDP connection |


# Client Pagination available methods

| Method | Description |
|--------|-------------|
| `currentPage([int])` | Get/set current page |
| `perPage([int])` | Get/set documents per page |
| `skip([int])` | Get/set additional skip offset |
| `filters([Object])` | Get/set query filters |
| `fields([Object])` | Get/set fields projection |
| `sort([Object])` | Get/set sort order |
| `debug([boolean])` | Get/set debug mode |
| `totalItems()` | Get total document count |
| `totalPages()` | Get total page count |
| `ready()` | Check if subscription is ready |
| `refresh()` | Force subscription refresh |
| `getPage()` | Get documents for current page |
| `destroy()` | Cleanup subscriptions and prevent memory leaks |


# Security

This package includes enterprise-grade security protections:

## NoSQL Injection Protection

Removes dangerous MongoDB operators from all queries:
- `$where` - Prevents arbitrary JavaScript execution
- `$eval` - Prevents server-side code execution  
- `$function` - Prevents function execution

Applied to: client queries, server filters, dynamic filters, transform filters, sort, and fields.

## Prototype Pollution Protection

- Server: Uses `Object.create(null)` for prototype-less objects
- Both: Filters forbidden keys (`__proto__`, `constructor`, `prototype`)
- Client: Additional validation in `filters()`, `fields()`, `sort()` methods

## DoS Protection

| Limit | Value | Description |
|-------|-------|-------------|
| MAX_LIMIT | 1000 | Maximum documents per page |
| MAX_SKIP | 100000 | Maximum skip offset |
| countInterval | 50-60000ms | Prevents count spam |

## Error Handling

- All publication errors use `self.error()` instead of `throw` (prevents publication crash)
- Error codes 4000-4006 for specific failure modes
- Graceful degradation on transform function failures


# Important Notes

## Offset-based Pagination

This package uses **offset-based pagination** (`skip` + `limit`), not cursor-based pagination.

**Implications:**
- ✅ Users can jump to any page directly
- ✅ Total page count is available
- ⚠️ Large skip values impact performance
- ⚠️ Data can shift if documents are added/removed

**For very large datasets**, consider cursor-based pagination alternatives.

## MAX_SKIP Limit

The `skip` parameter is limited to 100,000 to prevent DoS attacks.

Example with `perPage: 25`:
- Maximum skip = 100,000
- Maximum effective page ≈ 4,000 pages
- Beyond this, users should use filters to narrow results


# Changelog

### 1.3.0 (2026-03-13)

**Critical Fixes:**
- Publication errors now use `self.error()` + `return` instead of `throw` (prevents publication crash)
- `sanitizeQuery()` now checks for prototype pollution keys

**Stability:**
- Added `MAX_SKIP` (100,000) limit to prevent DoS
- `sort()` defaults to `{_id: 1}` for invalid input
- Fixed `getPage()` auto-page logic when `totalItems=0`
- Proper `countCursor` cleanup in `onStop()`

**Breaking Changes:**
- `skip` is now limited to 100,000 maximum
- Invalid `sort` values now default to `{_id: 1}` instead of being set as-is

### 1.2.9 (2026-03-13)

- Client-side query sanitization (`sanitizeClientQuery`)
- Prototype pollution protection in `sort()` and `fields()`
- Race condition fix with `isStopped` flag
- Subscription marker cleanup in non-reactive mode
- `transform_options` return type validation

### 1.2.8 (2026-03-13)

- NoSQL injection protection (`$where`, `$eval`, `$function`)
- Query sanitization on all input paths
- Prototype pollution protection with `Object.create(null)`
- DoS protection (limit max 1000, countInterval bounds)
- Error handling with try-catch blocks
- Memory leak fixes with WeakMap
- Defensive programming improvements

### 1.2.6

- Memory leak fix (clearInterval vs clearTimeout)
- Meteor 2.x and 3.x compatibility
- Added `destroy()` method
- Division by zero protection in `totalPages()`


# License

MIT


# Credits

Forked from [kurounin:pagination](https://atmospherejs.com/kurounin/pagination)

Inspired by:
- [alethes:pages](https://atmospherejs.com/alethes/pages)
- [aida:pagination](https://atmospherejs.com/aida/pagination)