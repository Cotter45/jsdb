import { promises as fs } from 'fs';
import * as fileSync from 'fs';
import * as path from 'path';

import JsonCollectionManager from './collection';

/**
 * Class representing a database manager for JSON collections.
 */
export class JSDB {
  private collections: Record<string, JsonCollectionManager>;
  private directoryPath: string;

  /**
   * Create a JSDB instance.
   * @param {string} directoryPath - The path to the directory where the collections should be stored.
   */
  constructor(directoryPath: string) {
    this.collections = {};
    this.directoryPath = directoryPath;

    if (!fileSync.existsSync(this.directoryPath)) {
      fileSync.mkdirSync(this.directoryPath);
    }
  }

  /**
   * Create a new collection.
   * @param {string} name - The name of the collection.
   * @param {number} maxFileSize - The maximum file size for the collection.
   * @return {Promise<JsonCollectionManager>} - The created collection manager.
   */
  createCollection(
    name: string,
    maxFileSize: number = 500000, // 500KB,
  ): JsonCollectionManager {
    const collectionPath = path.join(this.directoryPath, name);
    const manager = new JsonCollectionManager(collectionPath, maxFileSize);
    this.collections[name] = manager;
    return manager;
  }

  /**
   * Read (get) a collection.
   * @param {string} name - The name of the collection.
   * @return {JsonCollectionManager} - The requested collection manager.
   */
  getCollection(name: string): JsonCollectionManager {
    const collection = this.collections[name];
    return collection;
  }

  /**
   * Delete a collection.
   * @param {string} name - The name of the collection.
   * @return {Promise<void>}
   */
  async deleteCollection(name: string): Promise<void> {
    const collectionPath = path.join(this.directoryPath, name);
    await fs.rm(collectionPath, { recursive: true });
    delete this.collections[name];
  }
}
