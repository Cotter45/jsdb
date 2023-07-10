# JSDB

A lightweight, file-based JSON database manager for Node.js, inspired by MongoDB's approach to handling data. This is especially useful for small-scale applications, prototyping or for when a full-blown database setup is unnecessary.

# Features

- Supports basic CRUD operations (Create, Read, Update, Delete) as well as full text search on JSON collections.
- Each collection is managed separately, allowing for high flexibility.
- Asynchronous operations using Promises.
- File-based storage, each collection is created in it's own directory and manages it's own documents.
- Data consistency is ensured by using a promise-based queue to manage operations.

# Installation

Install via npm:

```bash
npm install @cotter45/jsdb
```

Usage

```javascript
import JSDB from '@cotter45/jsdb';

// Initialize JSDB with an absolute or relative path
// This will create a new database if it doesn't exist
// or load an existing one if it does
const db = new JSDB('./data');

/**
 * Callbacks
 */

// Create a collection, specify the name and the maximum size of each document in bytes - default is 500KB
// If the collection already exists, it will be loaded
db.createCollection('users', 10 * 1024 * 1024).then((users) => {
  // Use your collection here
});

/**
 * Async/Await
 */

// Create a collection, specify the name and the maximum size of each document in bytes - default is 500KB
// If the collection already exists, it will be loaded
const users = await db.createCollection('users', 10 * 1024 * 1024);

// Delete a collection
await db.deleteCollection('users');
```

# Collection Operations

Operations on a collection can be performed using the methods provided by the JsonCollectionManager class. For example:

## Create the collection first

```javascript
import JSDB from '@cotter45/jsdb';

// Initialize JSDB with an absolute or relative path
const db = new JSDB('./data');

// Create a collection
const users = await db.createCollection('users');
```

## Insert

```javascript
// Insert a record, automatically generates an id<number>
const insertUser = await users.insert({
  name: 'Alice',
  email: 'alice@wonderland.com',
});
// insertUser = { id: 1, name: 'Alice', email: 'alice@wonderland' }
```

## Get

```javascript
// Get a record, will throw an error if the record doesn't exist
const getUser = await users.get(1);
// getUser = { id: 1, name: 'Alice', email: 'alice@wonderland' }
```

## Update

```javascript
// Update a record, don't change the id and report a bug please...
const updateUser = await users.update(1, {
  name: 'Bob',
  email: 'bob@example.com',
});
// updateUser = { id: 1, name: 'Bob', email: 'bob@example' }
```

## Delete

```javascript
// Delete a record, will return the deleted record
const deleteUser = await users.delete(1);
// deleteUser = { id: 1, name: 'Bob', email: 'bob@example' }
```

## Search

```javascript
// Search for records using Fuse.js
// Limit and offset are optional
const searchUser = await users.search('bob@exa', {
  keys: ['email'],
  limit: 1,
  offset: 0,
});
// searchUser = [{ id: 1, name: 'Bob', email: 'bob@example' }]
```

# API Documentation

More detailed API documentation is available in the source code in the form of JSDoc comments.

# Contribution

Contributions are always welcome. Please make sure that your code follows the existing coding style, and don't forget to add tests for your changes.

# License

JSDB is released under the MIT License.
