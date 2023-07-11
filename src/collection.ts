import { promises as fs } from 'fs';
import * as filesSync from 'fs';
import * as path from 'path';
import PQueue from 'p-queue';
import Fuse from 'fuse.js/dist/fuse.min.js';
import { HashMap } from './map.js';

/**
 * Manages the storage of JSON data in a collection of files. Each file holds an array of JSON objects.
 * Data is accessed using the index file, which maps IDs to file paths. Files that reach a certain size
 * will not be written to anymore, and new files will be created for future writes.
 * @method insert - Insert a new JSON object into the collection.
 * @method get - Get a JSON object from the collection.
 * @method getMany - Get many JSON objects from the collection.
 * @method update - Update a JSON object in the collection.
 * @method delete - Delete a JSON object from the collection.
 * @method search - Search for JSON objects in the collection.
 */
export class JsonCollectionManager {
  private id: number;
  private directoryPath: string;
  private indexFilePath: string;
  private index: HashMap<string>;
  private maxFileSize: number;
  private fileQueues: Record<string, PQueue>;
  private fileSizes: Record<string, number> = {};
  private _ready: Promise<void>;
  private _resolveReady!: () => void;

  /**
   * Create a new JSONCollectionManager.
   * @param directoryPath - The path of the directory where the data files are stored.
   * @param maxFileSize - The maximum size of a data file in bytes, default is 100kb. Once a file reaches this size, it will no longer be written to.
   */
  constructor(directoryPath: string, maxFileSize = 102400) {
    this.directoryPath = directoryPath;
    this.indexFilePath = `${directoryPath}/index.json`;
    this.id = 0;

    if (!filesSync.existsSync(directoryPath)) {
      filesSync.mkdirSync(path.resolve(directoryPath));
    }

    this.index = new HashMap<string>(`${directoryPath}/index.json`);
    this.maxFileSize = maxFileSize;
    this.fileQueues = {};
    this._ready = new Promise((resolve) => {
      this._resolveReady = resolve;
    });

    this.loadFromFile();
  }

  /**
   * Returns a promise that resolves when the JSONCollectionManager is ready to use.
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
   * Insert an item into the collection. It assigns a unique ID to the item and stores it in the appropriate file.
   * @param data - The item to be inserted.
   */
  public async insert(data: any): Promise<void> {
    const id = this.id + 1;
    this.id = id;
    let filePath: any = await this.index.get(id);
    const size = this.getSizeInBytes(data);

    if (!filePath) {
      // This is a new entry, let's find a suitable file
      filePath = await this.findFileForInsertion(size);
      await this.index.insert(id, filePath);
    }

    // Get or create the queue for this file
    let queue = this.getQueue(filePath);

    // Return a promise that resolves when the operation is complete
    return queue.add(async () => {
      let jsonData: any[] = [];

      try {
        jsonData = await this.readJsonFile(filePath);
      } catch (err) {}

      if (this.getSizeInBytes(jsonData) + size > this.maxFileSize) {
        // If data doesn't fit, create a new file
        filePath = this.getNewFilePath();
        await this.index.update(id, filePath);
        queue = this.getQueue(filePath); // Update the queue
        jsonData = []; // We're working with a new file now
      }

      data.id = id;
      jsonData = jsonData.filter((item: any) => item.id !== id);
      jsonData.push(data);
      filePath = `${
        filePath.includes('.json') ? filePath : filePath + '.json'
      }`;
      await fs.writeFile(
        `${filePath}`,
        JSON.stringify(jsonData, null, 2),
        'utf-8',
      );
      await this.index.insert(id, filePath);
      await this.index.awaitQueueDrain();
      const newSize = this.getSizeInBytes(jsonData);
      const fileName = path.basename(filePath);
      this.fileSizes[fileName] = newSize;
      return data;
    });
  }

  /**
   * Retrieve an item from the collection.
   * @param id - The ID of the item.
   */
  public async get(id: number): Promise<any> {
    const document = await this.getDocument(id);
    if (!document) {
      return null;
    }

    return document.find((doc: any) => doc.id === id);
  }

  private async getDocument(id: number): Promise<any> {
    const filePath = await this.index.get(id);

    if (!filePath) {
      throw new Error(`No data found for id: ${id}`);
    }

    // Get the queue for this file
    const queue = this.getQueue(filePath);

    return queue.add(async () => {
      const jsonData = await this.readJsonFile(filePath);
      return jsonData;
    });
  }

  /**
   * Retrieve multiple items from the collection.
   * @param ids - An array of IDs of the items.
   */
  public async getMany(ids: number[]): Promise<any> {
    let documents = await this.getManyDocuments(ids);
    documents = documents.filter((doc: any) => doc);
    documents = documents.flat();
    const items = documents.filter((doc: any) => ids.includes(doc.id));
    return items;
  }

  private async getManyDocuments(ids: number[]): Promise<any> {
    const documents: any[] = [];
    for (const id of ids) {
      const document = await this.getDocument(id);
      if (!document) {
        throw new Error(`No data found for id: ${id}`);
      }
      documents.push(document.find((doc: any) => doc.id === id));
    }
    return documents;
  }

  /**
   * Update an item in the collection.
   * @param id - The ID of the item.
   * @param data - An object containing the new values. It will be merged with the current item data.
   */
  public async update(id: number, data: any): Promise<any> {
    const document = await this.getDocument(id);
    if (!document) {
      throw new Error(`No data found for id: ${id}`);
    }

    const filePath: any = await this.index.get(id);
    const queue = this.getQueue(filePath);

    return queue.add(async () => {
      const jsonData = await this.readJsonFile(filePath);
      const updatedData = jsonData.map((item: any) => {
        if (item.id === id) {
          return {
            ...item,
            ...data,
          };
        }
        return item;
      });

      await fs.writeFile(
        `${filePath}`,
        JSON.stringify(updatedData, null, 2),
        'utf-8',
      );

      await this.index.update(id, filePath);
      await this.index.awaitQueueDrain();
      const size = this.getSizeInBytes(updatedData);
      const fileName = path.basename(filePath);
      this.fileSizes[fileName] = size;
      return data;
    });
  }

  /**
   * Delete an item from the collection.
   * @param id - The ID of the item.
   */
  public async delete(id: number): Promise<any> {
    const filePath: any = await this.index.get(id);
    const queue = this.getQueue(filePath);

    return queue.add(async () => {
      const jsonData = await this.readJsonFile(filePath);
      const updatedData = jsonData.filter((item: any) => item.id !== id);
      const item = jsonData.find((item: any) => item.id === id);

      await fs.writeFile(
        `${filePath}`,
        JSON.stringify(updatedData, null, 2),
        'utf-8',
      );
      await this.index.delete(id);
      await this.index.awaitQueueDrain();
      const size = this.getSizeInBytes(updatedData);
      const fileName = path.basename(filePath);
      this.fileSizes[fileName] = size;
      return item;
    });
  }

  /**
   * Perform a search over all items in the collection.
   * @param text - The search string.
   * @param options - The search options.
   */
  public async search(
    text: string,
    {
      limit = 50,
      offset = 0,
      keys,
    }: {
      limit?: number;
      offset?: number;
      keys?: string[];
    },
  ): Promise<any[]> {
    const fileNames = await fs.readdir(this.directoryPath);
    let results = [];

    for (const fileName of fileNames) {
      const filePath = path.join(this.directoryPath, fileName);
      const queue = this.getQueue(filePath);

      const fileResults = await queue.add(async () => {
        let fileData = JSON.parse(await fs.readFile(filePath, 'utf-8'));

        // If fileData is not an array, wrap it in an array so Fuse can work
        if (!Array.isArray(fileData)) {
          fileData = [fileData];
        }

        const fuseOptions = {
          keys,
          isCaseSensitive: false,
          includeScore: true,
          shouldSort: true,
          findAllMatches: true,
          minMatchCharLength: 2,
          threshold: 0.6,
          location: 0,
          distance: 100,
        };

        const fuse = new Fuse(fileData, fuseOptions);
        const results = fuse.search(text);

        return results.map((result: any) => result.item);
      });

      results = results.concat(fileResults);
      if (results.length >= limit) {
        break;
      }
    }

    const fuseOptions = {
      keys,
      isCaseSensitive: false,
      includeScore: true,
      shouldSort: true,
      findAllMatches: true,
      minMatchCharLength: 2,
      threshold: 0.6,
      location: 0,
      distance: 100,
    };

    const fuse = new Fuse(results, fuseOptions);
    results = fuse.search(text);

    return results
      .map((result: any) => result.item)
      .slice(offset, offset + limit);
  }

  private async findFileForInsertion(dataSize: number): Promise<string> {
    const files = await fs.readdir(this.directoryPath);
    for (const file of files) {
      if (file === 'index.json') {
        continue;
      }

      if (
        !this.fileSizes[file] ||
        this.fileSizes[file] + dataSize <= this.maxFileSize
      ) {
        this.fileSizes[file] = (this.fileSizes[file] || 0) + dataSize;
        return `${this.directoryPath}/${file}`;
      }
    }

    // If all files are full, create a new one
    const newFilePath = this.getNewFilePath();
    this.fileSizes[newFilePath] = dataSize;
    return newFilePath;
  }

  private async readJsonFile(filePath: string): Promise<any> {
    if (!filePath) {
      return [];
    }

    filePath = filePath.includes('.json') ? filePath : filePath + '.json';
    const nativePath = path.resolve(`${filePath}`);
    try {
      await fs.access(nativePath);

      // File exists
      const json = await fs.readFile(nativePath, 'utf-8');
      return JSON.parse(json);
    } catch (err) {
      return [];
    }
  }

  private getNewFilePath(): string {
    // Use timestamp for unique file name
    const timestamp = new Date().getTime();
    return `${this.directoryPath}/${timestamp}`;
  }

  private getSizeInBytes(object: any): number {
    const jsonString = JSON.stringify(object);
    return Buffer.byteLength(jsonString, 'utf-8');
  }

  private getQueue(filePath: string): PQueue {
    if (!this.fileQueues[filePath]) {
      this.fileQueues[filePath] = new PQueue({ concurrency: 1 });
    }

    return this.fileQueues[filePath];
  }

  private async loadFromFile(): Promise<void> {
    try {
      // Check if the file exists
      await fs.access(this.indexFilePath);

      // Read the file content and parse it to JSON
      const json = await fs.readFile(this.indexFilePath, 'utf-8');
      const data = JSON.parse(json);
      this.index.preload(data);
      this.id = Object.keys(data).length;
      // get file sizes
      const files = await fs.readdir(this.directoryPath);
      for (const file of files) {
        if (file === 'index.json') {
          continue;
        }

        const filePath = `${this.directoryPath}/${file}`;
        const stats = await fs.stat(filePath);
        this.fileSizes[file] = stats.size;
      }

      // Indicate that the class instance is ready to be used
      return this._resolveReadyMethod();
    } catch (err) {
      // If the file doesn't exist, create it with an empty JSON object
      await fs.writeFile(this.indexFilePath, '{}', 'utf-8');

      // Indicate that the class instance is ready to be used
      return this._resolveReadyMethod();
    }
  }
}
