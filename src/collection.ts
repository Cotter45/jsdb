import { promises as fs } from 'fs';
import * as filesSync from 'fs';
import * as path from 'path';
const Fuse = require('fuse.js');

import HashMap from './map';
import { AsyncQueue } from './queue';

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
export default class JsonCollectionManager {
  private id: number;
  private directoryPath: string;
  private indexFilePath: string;
  private index: HashMap<string | number>;
  private maxFileSize: number;
  private fileSizes: Record<string, number> = {};
  private fileWritePromises: Record<string, Promise<void>> = {}; // Store ongoing write promises by file path
  private queue: AsyncQueue;

  /**
   * Create a new JSONCollectionManager.
   * @param directoryPath - The path of the directory where the data files are stored.
   * @param maxFileSize - The maximum size of a data file in bytes, default is 50kb. Once a file reaches this size, it will no longer be written to.
   */
  constructor(directoryPath: string, maxFileSize = 51200) {
    this.directoryPath = directoryPath;
    this.indexFilePath = `${directoryPath}/index.json`;
    this.id = 0;

    if (!filesSync.existsSync(directoryPath)) {
      filesSync.mkdirSync(path.resolve(directoryPath));
    }

    this.index = new HashMap<string>(`${directoryPath}/index.json`);
    this.maxFileSize = maxFileSize;
    this.loadFromFile();
    this.queue = new AsyncQueue();
  }

  /**
   * Insert an item into the collection. It assigns a unique ID to the item and stores it in the appropriate file.
   * @param data - The item to be inserted.
   */
  public async insert<T>(data: T): Promise<(T & { id: number }) | void> {
    this.id = this.id ? this.id + 1 : 1;
    const id = this.id;
    const filePath = await this.findFileForInsertion(this.getSizeInBytes(data));

    return new Promise((resolve, reject) => {
      this.queue.enqueue(async () => {
        try {
          let jsonData: any[] = await this.readJsonFile(filePath);

          const newData = { ...data, id };
          jsonData = jsonData.filter((item: any) => item.id !== id);
          jsonData.push(newData);
          const newSize = this.getSizeInBytes(jsonData);

          await fs.writeFile(`${filePath}`, JSON.stringify(jsonData), 'utf-8');
          await this.index.insert(id, filePath);

          const fileName = path.basename(filePath);
          this.fileSizes[fileName] = newSize;

          resolve({ ...data, id });
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  /**
   * Retrieve an item from the collection.
   * @param id - The ID of the item.
   */
  public async get<T>(id: number): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.enqueue(async () => {
        try {
          const document = await this.getDocument(id);
          if (!document) {
            throw new Error(`No data found for id: ${id}`);
          }
          resolve(document.find((doc: any) => doc.id === id));
        } catch (error) {
          reject(error);
        }
      });
    });
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
  public async getMany<T>(ids: number[]): Promise<T[]> {
    return new Promise((resolve, reject) => {
      this.queue.enqueue(async () => {
        try {
          const documents = await this.getManyDocuments(ids);
          resolve(documents);
        } catch (error) {
          reject(error);
        }
      });
    });
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
    return new Promise((resolve, reject) => {
      this.queue.enqueue(async () => {
        try {
          const filePath = (await this.index.get(id)) as string;
          const jsonData = await this.readJsonFile(filePath);

          const updatedData = jsonData.map((item: any) => {
            return item.id === id ? { ...item, ...data } : item;
          });

          await fs.writeFile(filePath, JSON.stringify(updatedData), 'utf-8');
          const size = this.getSizeInBytes(updatedData);
          this.fileSizes[path.basename(filePath)] = size;

          resolve(updatedData.find((item: any) => item.id === id));
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  /**
   * Delete an item from the collection.
   * @param id - The ID of the item.
   */
  public async delete<T>(id: number): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.enqueue(async () => {
        try {
          const filePath = (await this.index.get(id)) as string;
          const jsonData = await this.readJsonFile(filePath);

          const updatedData = jsonData.filter((item: any) => item.id !== id);
          const itemToDelete = jsonData.find((item: any) => item.id === id);

          await fs.writeFile(filePath, JSON.stringify(updatedData), 'utf-8');
          const size = this.getSizeInBytes(updatedData);

          if (size === 0) {
            await this.index.delete(id);
            await fs.unlink(filePath);
            delete this.fileSizes[path.basename(filePath)];
          } else {
            this.fileSizes[path.basename(filePath)] = size;
          }

          resolve(itemToDelete);
        } catch (error) {
          reject(error);
        }
      });
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
  ): Promise<T[]> {
    return new Promise((resolve, reject) => {
      this.queue.enqueue(async () => {
        try {
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
          let allItems: T[] = [];

          for (const fileName of fileNames) {
            if (fileName.startsWith('.') || fileName === 'index.json') {
              continue;
            }

            const filePath = path.join(this.directoryPath, fileName);
            let fileData = JSON.parse(await fs.readFile(filePath, 'utf-8'));

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

          resolve(
            finalResults
              .map((result: any) => result.item)
              .slice(offset, offset + limit),
          );
        } catch (error) {
          reject(error);
        }
      });
    });
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
    offset = 0,
    order,
  }: {
    filter: (item: T) => boolean;
    limit?: number;
    offset?: number;
    order?: 'asc' | 'desc';
  }): Promise<T[]> {
    return new Promise((resolve, reject) => {
      this.queue.enqueue(async () => {
        try {
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

          resolve(allItems);
        } catch (error) {
          reject(error);
        }
      });
    });
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

    // Update the index file
    await this.index.insert(this.id, newFilePath, true);
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
    } catch (err: any) {
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
