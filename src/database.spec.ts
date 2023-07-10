import { JSDB } from './database.js';
import { promises as fs } from 'fs';
import { join } from 'path';

describe('CollectionWrapper', () => {
  const dirPath = 'test-db';
  const collectionWrapper = new JSDB(dirPath);

  test('creates a new collection', async () => {
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

  test('gets a collection', async () => {
    const collection = collectionWrapper.getCollection('test-collection');
    expect(collection).toBeDefined();
  });

  test('deletes a collection', async () => {
    await collectionWrapper.deleteCollection('test-collection');
    try {
      await collectionWrapper.getCollection('test-collection');
    } catch (error) {
      expect(error).toBeDefined();
    }

    await fs.rmdir(join(dirPath));
  });
});
