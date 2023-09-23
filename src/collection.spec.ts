import * as fs from 'fs';
import * as path from 'path';

import { JsonCollectionManager } from './collection.js';

describe('JsonCollectionManager', () => {
  const directoryPath = './test-data';
  const directoryPath2 = './test-data2';
  let manager: JsonCollectionManager;
  let manager2: JsonCollectionManager;

  beforeEach(async () => {
    manager = new JsonCollectionManager(directoryPath);
    manager2 = new JsonCollectionManager(directoryPath2);
  });

  afterEach(() => {
    const files = fs.readdirSync(directoryPath);
    for (const file of files) {
      fs.unlinkSync(path.join(directoryPath, file));
    }

    fs.rmdirSync(directoryPath);

    const files2 = fs.readdirSync(directoryPath2);
    for (const file of files2) {
      fs.unlinkSync(path.join(directoryPath2, file));
    }

    fs.rmdirSync(directoryPath2);
  });

  it('should insert and retrieve data', async () => {
    const id = 1;
    const data = { name: 'test', value: 123 };
    await manager.insert(data);
    const result = await manager.get(id);
    expect(result).toEqual({
      id,
      ...data,
    });
  });

  it('should insert and update data', async () => {
    const id = 1;
    const data = { name: 'test', value: 123 };
    await manager2.insert(data);
    const result = await manager2.get(id);
    expect(result).toEqual({
      id,
      ...data,
    });

    const updatedData = { name: 'test', value: 456 };
    await manager2.update(id, updatedData);
    const updatedResult = await manager2.get(id);
    expect(updatedResult).toEqual({
      id,
      ...updatedData,
    });
  });

  it('should insert many and getMany', async () => {
    const ids = [];
    const values: any = [];
    for (let i = 0; i < 1000; i++) {
      ids.push(i + 1);
      values.push({
        id: i + 1,
        name: `test-${i + 1}`,
        value: i + 1,
      });
    }

    await Promise.all(
      ids.map((id, index) => manager.insert({ id, ...values[index] })),
    );

    const result = await manager.getMany([1, 2, 3]);
    expect(result).toEqual(values.slice(0, 3));
  });

  it('should insert and delete data', async () => {
    const id = 1;
    const data = { name: 'test', value: 123 };
    await manager.insert(data);
    const result = await manager.get(id);
    expect(result).toEqual({
      id,
      ...data,
    });

    await manager.delete(id);
    try {
      await manager.get(id);
    } catch (error: any) {
      expect(error.message).toEqual(`No data found for id: ${id}`);
    }
  });

  it('should handle high IO load', async () => {
    const ids = [];
    const values: any = [];
    for (let i = 0; i < 100; i++) {
      ids.push(i + 1);
      values.push({
        name: `test-${i + 1}`,
        value: i + 1,
      });
    }

    await Promise.all(
      ids.map((id, index) => manager.insert({ id, ...values[index] })),
    );

    for (let i = 0; i < ids.length; i++) {
      const result = await manager.get(ids[i]);
      expect(result).toEqual({ id: ids[i], ...values[i] });
    }
  });

  it('should search through multiple files', async () => {
    const ids = [];
    const values: any = [];
    for (let i = 0; i < 1000; i++) {
      ids.push(i + 1);
      values.push({
        id: i + 1,
        name: `test-${i + 1}`,
        value: i + 1,
      });
    }

    ids.push(1001);
    values.push({
      id: 1001,
      name: 'onomatopoeia',
      value: 1001,
    });

    await Promise.all(
      ids.map((id, index) => manager.insert({ id, ...values[index] })),
    );

    const result: any = await manager.search('test-55', {
      limit: 50,
      offset: 0,
      keys: ['name'],
    });

    expect(result.length).toEqual(50);
    expect(result[0]).toEqual({
      id: 55,
      name: 'test-55',
      value: 55,
    });

    const result2: any = await manager.search('onomatopoeia', {
      limit: 50,
      offset: 0,
      keys: ['name'],
    });

    expect(result2.length).toEqual(1);
    expect(result2[0]).toEqual({
      id: 1001,
      name: 'onomatopoeia',
      value: 1001,
    });
  });

  it('should run the where method to get multiple filtered results', async () => {
    type Val = {
      id: number;
      name: string;
      value: number;
    };

    const ids = [];
    const values: any = [];
    for (let i = 0; i < 1000; i++) {
      ids.push(i + 1);
      values.push({
        id: i + 1,
        name: `test-${i + 1}`,
        value: i + 1,
      });
    }

    ids.push(1001);
    values.push({
      id: 1001,
      name: 'onomatopoeia',
      value: 1001,
    });

    await Promise.all(
      ids.map((id, index) => manager.insert({ id, ...values[index] })),
    );

    const result = await manager.where<Val>({
      filter: (item) => item.value > 500,
    });

    expect(result.length).toEqual(501);
    expect(result[0]).toEqual({
      id: 501,
      name: 'test-501',
      value: 501,
    });
  });

  it('should run the where method to get multiple filtered results with limit and offset', async () => {
    type Val = {
      id: number;
      name: string;
      value: number;
    };

    const ids = [];
    const values: any = [];
    for (let i = 0; i < 1000; i++) {
      ids.push(i + 1);
      values.push({
        id: i + 1,
        name: `test-${i + 1}`,
        value: i + 1,
      });
    }

    ids.push(1001);
    values.push({
      id: 1001,
      name: 'onomatopoeia',
      value: 1001,
    });

    await Promise.all(
      ids.map((id, index) => manager.insert({ id, ...values[index] })),
    );

    const result = await manager.where<Val>({
      filter: (item) => item.value > 500,
      limit: 50,
      offset: 0,
    });

    expect(result.length).toEqual(50);
    expect(result[0]).toEqual({
      id: 501,
      name: 'test-501',
      value: 501,
    });

    const result2 = await manager.where<Val>({
      filter: (item) => item.name === 'onomatopoeia',
      limit: 50,
      offset: 0,
    });

    expect(result2.length).toEqual(1);
    expect(result2[0]).toEqual({
      id: 1001,
      name: 'onomatopoeia',
      value: 1001,
    });
  });

  it('should run where with order = desc', async () => {
    type Val = {
      id: number;
      name: string;
      value: number;
    };

    const ids = [];
    const values: any = [];
    for (let i = 0; i < 1000; i++) {
      ids.push(i + 1);
      values.push({
        id: i + 1,
        name: `test-${i + 1}`,
        value: i + 1,
      });
    }

    ids.push(1001);
    values.push({
      id: 1001,
      name: 'onomatopoeia',
      value: 1001,
    });

    await Promise.all(
      ids.map((id, index) => manager.insert({ id, ...values[index] })),
    );

    const result = await manager.where<Val>({
      filter: (item) => item.value > 500,
      limit: 50,
      offset: 0,
      order: 'desc',
    });

    expect(result.length).toEqual(50);
    expect(result[0]).toEqual({
      id: 1001,
      name: 'onomatopoeia',
      value: 1001,
    });
  });

  it('should throw an error when data is not found', async () => {
    const id = 3463;
    try {
      await manager.get(id);
    } catch (error: any) {
      expect(error.message).toEqual(`No data found for id: ${id}`);
    }
  });

  it('should load from an existing directory', async () => {
    const manager = new JsonCollectionManager('./test-collection');

    const result = await manager.get(1);
    expect(result).toEqual({
      id: 1,
      name: 'test-1',
      value: 1,
    });

    const result2: any = await manager.insert({
      name: 'test-1001',
      value: 1002,
    });

    const result3 = await manager.get(result2.id);
    expect(result3).toEqual({
      id: result2.id,
      name: 'test-1001',
      value: 1002,
    });
  });
});
