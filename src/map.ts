import { promises as fs } from 'fs';
import * as fileSync from 'fs';

import { AsyncQueue } from './queue';

/**
 * HashMap Class. It's a simple file-backed asynchronous hashmap.
 * @template T The type of the hashmap value.
 */
export default class HashMap<T> {
  private store: { [key: number | string]: number | T };
  private filePath: string;
  private currentId: number;
  private queue: AsyncQueue;

  /**
   * @param {string} filePath The file path to load the hashmap data.
   */
  constructor(filePath: string) {
    this.store = {};
    this.filePath = filePath;
    this.currentId = 1;
    this.loadFromFile();
    this.queue = new AsyncQueue();
  }

  /**
   * Get the key for a given id.
   * @param {number} id The id to get the key for.
   * @returns {string | null} Returns the key if found, null otherwise.
   */
  public getKey(id: number): string | null {
    for (const key of Object.keys(this.store)) {
      const [start, end] = key.split('-').map((n) => parseInt(n, 10));
      if (id >= start && id < end) {
        return key;
      }
    }
    return null;
  }

  /**
   * Get the filename for a given key.
   * @param {number | string} key The key to get the filename for.
   * @returns {string} Returns the filename.
   */
  public getFilename(key: string): string {
    return `${this.filePath}/${key}.json`;
  }

  /**
   * Insert a key-value pair into the hashmap.
   * @param {number | string} id The key to insert.
   * @param {T} value The value to insert.
   * @returns {Promise<void | T>}
   */
  public async insert(
    id: number,
    value: T,
    oversize?: boolean,
  ): Promise<void | T> {
    const key = this.getKey(id);
    const currentStoreId: any = this.store['currentId'] || 1;

    if (oversize) {
      const key = this.getKey(id);
      const currentFilepath = key ? this.getFilename(key) : null;

      if (key && currentFilepath) {
        const file = this.store[key];
        delete this.store[key];
        const [start, end] = key.split('-').map((n) => parseInt(n, 10));
        const newEnd = end - 2;
        const newKey = `${start}-${newEnd}`;
        this.store[newKey] = file;
      }

      this.store['currentId'] = id;
      this.store[`${id}-${id + 2}`] = value;
      this.enqueueSaveToFile();
      return value;
    }

    if (id > currentStoreId) {
      this.store['currentId'] = id;
    }

    if (key) {
      const [start, end] = key.split('-').map((n) => parseInt(n, 10));
      const higherEnd = Math.max(end, id + 2);
      delete this.store[key];
      this.store[`${start}-${higherEnd}`] = value;
      this.enqueueSaveToFile();
      return;
    }

    const newEnd = id + 2;

    let allKeys: any = Object.keys(this.store);
    if (allKeys.length > 1) {
      allKeys = allKeys.filter((k: string) => k && k !== 'currentId');
      allKeys = allKeys.map((k: string) => parseInt(k.split('-')[1], 10));
      const maxKey = Math.max(...allKeys);
      const key = this.getKey(maxKey - 2);

      if (key) {
        const [start, end] = key.split('-').map((n) => parseInt(n, 10));
        const value = this.store[key];
        delete this.store[key];
        this.store[`${start}-${end - 1}`] = value;
      }
    }

    const newKey = `${id}-${newEnd}`;
    this.store[newKey] = value;
    this.enqueueSaveToFile();
    return value;
  }

  /**
   * Get a value from the hashmap by its key.
   * @param {number} id The key to retrieve.
   * @returns {Promise<number | T>} Returns a Promise that resolves to the value or undefined.
   */
  public async get(id: number): Promise<number | void | NonNullable<T> | null> {
    const rangeKey = this.getKey(id);
    if (!rangeKey) return null;
    return this.store[rangeKey] || null;
  }

  /**
   * Delete a key-value pair from the hashmap.
   * @param {number} id The key to delete.
   * @returns {Promise<void>}
   */
  public async delete(id: number): Promise<void> {
    const key = this.getKey(id);
    if (!key) {
      throw new Error(`No valid range found for ID: ${id}`);
    }
    delete this.store[key];
    this.enqueueSaveToFile();
  }

  /**
   * Update a value in the hashmap.
   * @param {number} id The key of the value to update.
   * @param {T} value The new value.
   * @returns {Promise<void>}
   */
  public async update(id: number, value: T): Promise<void> {
    const key = this.getKey(id);
    if (!key) {
      throw new Error(`No valid range found for ID: ${id}`);
    }
    this.store[key] = value;
    this.enqueueSaveToFile();
  }

  private enqueueSaveToFile(): void {
    this.queue.enqueue(() => this.saveToFile());
  }

  public async saveToFile(): Promise<void> {
    const data = JSON.stringify(this.store, null, 2);
    await fs.writeFile(this.filePath, data, 'utf-8');
  }

  private loadFromFile(): void {
    // if file doesn't exist, create it
    try {
      if (!fileSync.existsSync(this.filePath)) {
        throw new Error('Index file does not exist');
      }

      const json = fileSync.readFileSync(this.filePath, 'utf-8');
      const data = JSON.parse(json);
      this.store = data;

      if (!data.currentId) {
        // find highest id in store
        let highestId = 0;
        for (const key of Object.keys(this.store)) {
          const end = key.split('-').map((n) => parseInt(n, 10))[1];
          if (end > highestId) {
            highestId = end;
          }
        }
        this.store['currentId'] = highestId + 1;
        this.currentId = highestId + 1;
      }

      this.currentId = data.currentId;
    } catch (err) {
      this.store = {};
      this.currentId = 1;
      fileSync.writeFileSync(this.filePath, '{}', 'utf-8');
    }
  }
}
