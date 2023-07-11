import { JSDB } from './database.js';
import { promises as fs } from 'fs';
import { join } from 'path';

describe('JSDB', () => {
  const dirPath = 'test-db';
  let collectionWrapper: JSDB;

  beforeAll(async () => {
    collectionWrapper = new JSDB(dirPath);
  });

  it('creates a new collection', async () => {
    const collection = await collectionWrapper.createCollection(
      'test-collection',
      1024,
    );
    expect(collection).toBeDefined();

    await collection.insert({ name: 'test', value: 123 });
    const result = await collection.get(1);
    expect(result).toEqual({
      id: 1,
      name: 'test',
      value: 123,
    });
  });

  it('gets a collection', async () => {
    const collection = await collectionWrapper.getCollection('test-collection');
    expect(collection).toBeDefined();

    const result = await collection.get(1);
    expect(result).toEqual({
      id: 1,
      name: 'test',
      value: 123,
    });
  });

  it('should load an existing db', async () => {
    const db = new JSDB('./db');

    const collection = await db.createCollection('users');
    expect(collection).toBeDefined();

    const result = await collection.get(1);
    expect(result).toEqual({
      id: 1,
      hello: 'world',
    });
  });

  it('deletes a collection', async () => {
    await collectionWrapper.deleteCollection('test-collection');
    try {
      await collectionWrapper.getCollection('test-collection');
    } catch (error) {
      expect(error).toBeDefined();
    }

    await fs.rmdir(join(dirPath));
  });
});
