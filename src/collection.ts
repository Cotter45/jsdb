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
  private index: HashMap<string | number>;
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
   * Insert an item into the collection. It assigns a unique ID to the item and stores it in the appropriate file.
   * @param data - The item to be inserted.
   */
  public async insert<T>(data: T): Promise<(T & { id: number }) | void> {
    this.id = this.id ? this.id + 1 : 1;
    const id = this.id;

    const filePath = await this.findFileForInsertion(this.getSizeInBytes(data));

    // Get or create the queue for this file
    const queue = this.getQueue(filePath);

    // Return a promise that resolves when the operation is complete
    return queue.add(async () => {
      let jsonData: any[] = [];

      try {
        jsonData = await this.readJsonFile(filePath);
      } catch (err) {}

      const newData = { ...data, id };

      jsonData = jsonData.filter((item: any) => item.id !== id);
      jsonData.push(newData);
      await fs.writeFile(`${filePath}`, JSON.stringify(jsonData), 'utf-8');
      await this.index.insert(id, filePath);
      const newSize = this.getSizeInBytes(jsonData);
      const fileName = path.basename(filePath);
      this.fileSizes[fileName] = newSize;
      return newData;
    });
  }

  /**
   * Retrieve an item from the collection.
   * @param id - The ID of the item.
   */
  public async get<T>(id: number): Promise<T> {
    const document = await this.getDocument(id);
    if (!document) {
      return null;
    }

    return document.find((doc: any) => doc.id === id);
  }

  private async getDocument(id: number): Promise<any> {
    const filePath = await this.index.get(id);

    if (!filePath || typeof filePath !== 'string') {
      throw new Error(`No data found for id: ${id}`);
    }

    const jsonData = await this.readJsonFile(filePath);
    return jsonData;
  }

  /**
   * Retrieve multiple items from the collection.
   * @param ids - An array of IDs of the items.
   */
  public async getMany<T>(ids: number[]): Promise<T> {
    const documents = await this.getManyDocuments(ids);
    return documents;
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
  public async update<T>(id: number, data: T): Promise<T> {
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

      await fs.writeFile(`${filePath}`, JSON.stringify(updatedData), 'utf-8');

      const size = this.getSizeInBytes(updatedData);
      const fileName = path.basename(filePath);
      this.fileSizes[fileName] = size;
      return updatedData.find((item: any) => item.id === id);
    });
  }

  /**
   * Delete an item from the collection.
   * @param id - The ID of the item.
   */
  public async delete<T>(id: number): Promise<T> {
    const filePath: any = await this.index.get(id);
    const queue = this.getQueue(filePath);

    return queue.add(async () => {
      const jsonData = await this.readJsonFile(filePath);
      const updatedData = jsonData.filter((item: any) => item.id !== id);
      const item = jsonData.find((item: any) => item.id === id);

      await fs.writeFile(`${filePath}`, JSON.stringify(updatedData), 'utf-8');

      const size = this.getSizeInBytes(updatedData);

      if (size === 0) {
        await this.index.delete(id);
        await fs.unlink(filePath);
        delete this.fileSizes[path.basename(filePath)];
      } else {
        const fileName = path.basename(filePath);
        this.fileSizes[fileName] = size;
      }
      return item;
    });
  }

  /**
   * Perform a search over all items in the collection.
   * @param text - The search string.
   * @param options - The search options.
   */
  public async search<T>(
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
  ): Promise<T> {
    const fileNames = await fs.readdir(this.directoryPath);
    const fuseOptions = {
      keys,
      isCaseSensitive: false,
      includeScore: true,
      shouldSort: true,
      findAllMatches: true,
      minMatchCharLength: 4,
      threshold: 0.6,
      location: 0,
      distance: 100,
    };
    let allItems = [];

    for (const fileName of fileNames) {
      if (fileName.startsWith('.') || fileName === 'index.json') {
        continue;
      }

      const filePath = path.join(this.directoryPath, fileName);
      let fileData = JSON.parse(await fs.readFile(filePath, 'utf-8'));

      // If fileData is not an array, wrap it in an array so Fuse can work
      if (!Array.isArray(fileData)) {
        fileData = [fileData];
      }

      const fuse = new Fuse(fileData, fuseOptions);
      const searchResults = fuse.search(text);
      const items = searchResults.map((result: any) => result.item);
      allItems = allItems.concat(items);
    }

    const fuseAll = new Fuse(allItems, fuseOptions);
    const finalResults = fuseAll.search(text);

    return finalResults
      .map((result: any) => result.item)
      .slice(offset, offset + limit);
  }

  /**
   * Where is a method for you to customize your filter.
   * @param where - Function to filter the data
   * @param limit - Limit the number of results
   * @param offset - Offset the results
   * @returns {Promise<T>}
   */
  public async where<T>({
    filter,
    limit,
    offset,
    order,
  }: {
    filter: (item: T) => boolean;
    limit?: number;
    offset?: number;
    order?: 'asc' | 'desc';
  }): Promise<T[]> {
    let fileNames = await fs.readdir(this.directoryPath);
    let allItems: T[] = [];

    if (order === 'desc') {
      fileNames = fileNames.reverse();
    }

    let count = 0; // To keep track of the total number of items found

    for (const fileName of fileNames) {
      if (limit && count >= limit + offset) {
        break;
      }

      if (fileName.startsWith('.') || fileName === 'index.json') {
        continue;
      }

      const filePath = path.join(this.directoryPath, fileName);

      let jsonData = await this.readJsonFile(filePath);

      if (order === 'desc') {
        jsonData = jsonData.reverse();
      }

      const items = jsonData.filter(filter);

      if (limit && count + items.length > limit) {
        const itemsToTake = limit - count;
        allItems = allItems.concat(items.slice(0, itemsToTake));
        break;
      }

      allItems = allItems.concat(items);
      count += items.length;
    }

    return allItems;
  }

  private async findFileForInsertion(dataSize: number): Promise<string> {
    const files = Object.entries(this.fileSizes);
    for (const [fileName, size] of files) {
      // Ensure that the new data fits into the file
      if (size + dataSize <= this.maxFileSize) {
        this.fileSizes[fileName] = (size || 0) + dataSize;
        return `${fileName}`; // <-- might be here
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
    return `${this.directoryPath}/${timestamp}.json`;
  }

  private getSizeInBytes(object: any): number {
    const jsonString = JSON.stringify(object);
    return Buffer.byteLength(jsonString, 'utf-8');
  }

  private getQueue(filePath: string): PQueue {
    if (!this.fileQueues[filePath]) {
      const queue = new PQueue({ concurrency: 1 });

      queue.on('idle', async () => {
        await this.index.awaitQueueDrain();
      });

      this.fileQueues[filePath] = queue;
    }

    return this.fileQueues[filePath];
  }

  private loadFromFile(): void {
    try {
      // Check if the file exists
      if (!filesSync.existsSync(this.indexFilePath)) {
        throw new Error('Index file does not exist');
      }

      // Read the file content and parse it to JSON
      const json = filesSync.readFileSync(this.indexFilePath, 'utf-8');
      const data = JSON.parse(json);
      this.id = data.currentId;

      // get file sizes
      const files = filesSync.readdirSync(this.directoryPath);
      for (const file of files) {
        if (file === 'index.json') {
          continue;
        }

        if (file.startsWith('.')) {
          continue;
        }

        const filePath = `${this.directoryPath}/${file}`;
        const stats = filesSync.statSync(filePath);
        this.fileSizes[`${filePath}`] = stats.size;
      }
    } catch (err) {
      // If the file doesn't exist, create it
      if (err.code === 'ENOENT') {
        filesSync.writeFileSync(this.indexFilePath, '{}', 'utf-8');
        return;
      }

      // If the error is not because the file doesn't exist, throw it
      throw err;
    }
  }
}
