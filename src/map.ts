import { promises as fs } from 'fs';
import PQueue from 'p-queue';

/**
 * HashMap Class. It's a simple file-backed asynchronous hashmap.
 * @template T The type of the hashmap value.
 */
export class HashMap<T> {
  private store: { [key: number | string]: T | number };
  private filePath: string;
  private updateQueue: PQueue;
  private _ready: Promise<void>;
  private _resolveReady!: () => void;
  private currentId: number;

  /**
   * @param {string} filePath The file path to load the hashmap data.
   */
  constructor(filePath: string) {
    this.store = {};
    this.filePath = filePath;
    this.updateQueue = new PQueue({ concurrency: 1 });

    this._ready = new Promise((resolve) => {
      this._resolveReady = resolve;
    });

    this.loadFromFile();
  }

  /**
   * Returns a promise that will resolve when the HashMap is ready to be used.
   * @returns {Promise<void>}
   */
  public whenReady(): Promise<void> {
    return this._ready;
  }

  private _resolveReadyMethod(): void {
    if (this._resolveReady) {
      this._resolveReady();
      this._resolveReady = null; // Avoid multiple calls
    }
  }

  /**
   * Updates the hashmap based on preload data.
   * @param {T{}} preloadData The preload data.
   * @returns {Promise<void>}
   */
  public async preload(preloadData: { [key: number]: T }): Promise<void> {
    this.store = preloadData;
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
   * @param {string} key The key to get the filename for.
   * @returns {string} Returns the filename.
   */
  public getFilename(key: string): string {
    return `${this.filePath}/${key}.json`;
  }

  /**
   * Insert a key-value pair into the hashmap.
   * @param {number} key The key to insert.
   * @param {T} value The value to insert.
   * @returns {Promise<void>}
   */
  public async insert(id: number, value: T): Promise<void> {
    return this.updateQueue.add(() => {
      const key = this.getKey(id);
      const currentStoreId: any = this.store['currentId'] || 1;

      if (id > currentStoreId) {
        this.store['currentId'] = id;
      }

      if (key) {
        const [start, end] = key.split('-').map((n) => parseInt(n, 10));
        const higherEnd = Math.max(end, id + 2);
        delete this.store[key];
        this.store[`${start}-${higherEnd}`] = value;
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
    });
  }

  /**
   * Get a value from the hashmap by its key.
   * @param {number} id The key to retrieve.
   * @returns {Promise<T | void>} Returns a Promise that resolves to the value or undefined.
   */
  public async get(id: number): Promise<T | void | number> {
    return this.updateQueue.add(() => {
      const rangeKey = this.getKey(id);
      if (!rangeKey) return null;
      return this.store[rangeKey] || null;
    });
  }

  /**
   * Delete a key-value pair from the hashmap.
   * @param {number} id The key to delete.
   * @returns {Promise<void>}
   */
  public async delete(id: number): Promise<void> {
    return this.updateQueue.add(() => {
      const key = this.getKey(id);
      if (!key) {
        throw new Error(`No valid range found for ID: ${id}`);
      }
      delete this.store[key];
    });
  }

  /**
   * Update a value in the hashmap.
   * @param {number} id The key of the value to update.
   * @param {T} value The new value.
   * @returns {Promise<void>}
   */
  public async update(id: number, value: T): Promise<void> {
    return this.updateQueue.add(() => {
      const key = this.getKey(id);
      if (!key) {
        throw new Error(`No valid range found for ID: ${id}`);
      }
      this.store[key] = value;
    });
  }

  public async saveToFile(): Promise<void> {
    if (!this.updateQueue.isPaused) {
      const data = JSON.stringify(this.store, null, 2);
      await fs.writeFile(this.filePath, data, 'utf-8');
    }
  }

  private async loadFromFile(): Promise<void> {
    // if file doesn't exist, create it
    try {
      await fs.access(this.filePath);

      const json = await fs.readFile(this.filePath, 'utf-8');
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
      this._resolveReadyMethod();
    } catch (err) {
      await fs.writeFile(this.filePath, '{}', 'utf-8');
      this._resolveReadyMethod();
    }
  }

  /**
   * Await until all pending updates to the hashmap have finished, and then save the hashmap to the file.
   * @returns {Promise<void>}
   */
  public async awaitQueueDrain(): Promise<void> {
    this.updateQueue.on('idle', async () => {
      await this.saveToFile();
    });
  }
}
