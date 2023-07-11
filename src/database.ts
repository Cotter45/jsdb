import { JsonCollectionManager } from './collection.js';
import { promises as fs } from 'fs';
import * as files from 'fs';
import * as path from 'path';

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

    if (!files.existsSync(this.directoryPath)) {
      files.mkdirSync(this.directoryPath);
    }
  }

  /**
   * Returns a promise that will resolve when the JSDB is ready to be used.
   * @returns {Promise<boolean>} - A promise that will resolve when the JSDB is ready to be used. If the directory is empty, it will resolve to false.
   */
  async initialize(): Promise<boolean> {
    const files = await fs.readdir(this.directoryPath);
    if (files.length === 0) {
      return false;
    }

    for (const file of files) {
      if (file.startsWith('.')) {
        continue;
      }

      const collectionPath = path.join(this.directoryPath, file);
      const manager = new JsonCollectionManager(collectionPath);
      await manager.whenReady();
      this.collections[file] = manager;
    }

    return true;
  }

  /**
   * Create a new collection.
   * @param {string} name - The name of the collection.
   * @param {number} maxFileSize - The maximum file size for the collection.
   * @return {Promise<JsonCollectionManager>} - The created collection manager.
   */
  async createCollection(
    name: string,
    maxFileSize = 500000, // 500KB,
  ): Promise<JsonCollectionManager> {
    const result = await this.initialize();

    if (result) {
      return await this.getCollection(name);
    }

    const collectionPath = path.join(this.directoryPath, name);
    const manager = new JsonCollectionManager(collectionPath, maxFileSize);
    await manager.whenReady();
    this.collections[name] = manager;
    return manager;
  }

  /**
   * Read (get) a collection.
   * @param {string} name - The name of the collection.
   * @return {JsonCollectionManager} - The requested collection manager.
   */
  async getCollection(name: string): Promise<JsonCollectionManager> {
    const collection = this.collections[name];
    await collection.whenReady();
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
