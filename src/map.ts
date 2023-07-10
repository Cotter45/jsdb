import { promises as fs } from 'fs';
import PQueue from 'p-queue';

/**
 * HashMap Class. It's a simple file-backed asynchronous hashmap.
 * @template T The type of the hashmap value.
 */
export class HashMap<T> {
  private store: { [key: number]: T };
  private filePath: string;
  private updateQueue: PQueue;
  private _ready: Promise<void>;
  private _resolveReady!: () => void;

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
   * Insert a key-value pair into the hashmap.
   * @param {number} key The key to insert.
   * @param {T} value The value to insert.
   * @returns {Promise<void>}
   */
  public insert(key: number, value: T): Promise<void> {
    return this.updateQueue.add(() => {
      this.store[key] = value;
    });
  }

  /**
   * Get a value from the hashmap by its key.
   * @param {number} key The key to retrieve.
   * @returns {Promise<T | void>} Returns a Promise that resolves to the value or undefined.
   */
  public get(key: number): Promise<T | void> {
    return this.updateQueue.add(() => {
      return this.store[key] || null;
    });
  }

  /**
   * Delete a key-value pair from the hashmap.
   * @param {number} key The key to delete.
   * @returns {Promise<void>}
   */
  public delete(key: number): Promise<void> {
    return this.updateQueue.add(() => {
      delete this.store[key];
    });
  }

  /**
   * Update a value in the hashmap.
   * @param {number} key The key of the value to update.
   * @param {T} value The new value.
   * @returns {Promise<void>}
   */
  public update(key: number, value: T): Promise<void> {
    return this.updateQueue.add(() => {
      this.store[key] = value;
    });
  }

  private async saveToFile(): Promise<void> {
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
    await this.updateQueue.onIdle();
    await this.saveToFile();
  }
}
