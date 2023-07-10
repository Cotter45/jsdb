import { HashMap } from './map.js';
import { promises as fs } from 'fs';

describe('HashMap', () => {
  let tree1: HashMap<number>;
  let tree2: HashMap<number>;
  const filePath1 = 'test1.json';
  const filePath2 = 'test2.json';
  const filePath3 = 'test3.json';

  beforeEach(async () => {
    // Each test gets its own HashMap and file
    tree1 = new HashMap<number>(filePath1);
    tree2 = new HashMap<number>(filePath2);
    await fs.writeFile(filePath1, '', 'utf-8');
    await fs.writeFile(filePath2, '', 'utf-8');
  });

  afterEach(async () => {
    await fs.unlink(filePath1);
    await fs.unlink(filePath2);
  });

  afterAll(async () => {
    await fs.unlink(filePath3);
  });

  it('should insert and get values', async () => {
    await tree1.insert(123, 123);
    expect(await tree1.get(123)).toBe(123);
  });

  it('should get null for non-existent key', async () => {
    expect(await tree1.get(2462)).toBeNull();
  });

  it('should get value for key in right subtree', async () => {
    await tree1.insert(1, 123);
    await tree1.insert(2, 456);
    expect(await tree1.get(2)).toBe(456);
    expect(await tree1.get(1)).toBe(123);
  });

  it('should insert and get multiple values', async () => {
    await tree2.insert(1, 123);
    await tree2.insert(2, 456);
    await tree2.insert(3, 789);
    await tree2.insert(4, 101112);
    await tree2.insert(5, 131415);

    expect(await tree2.get(1)).toBe(123);
    expect(await tree2.get(2)).toBe(456);
    expect(await tree2.get(3)).toBe(789);
    expect(await tree2.get(4)).toBe(101112);
    expect(await tree2.get(5)).toBe(131415);
    await tree2.awaitQueueDrain();
  });

  it('should delete a node with no children', async () => {
    await tree1.insert(1, 123);
    tree1.delete(1);
    expect(await tree1.get(1)).toBeNull();
  });

  it('should delete a node with one child', async () => {
    await tree1.insert(1, 123);
    await tree1.insert(2, 456);
    tree1.delete(1);
    expect(await tree1.get(1)).toBeNull();
    expect(await tree1.get(2)).toBe(456);
  });

  it('should delete a node with two children', async () => {
    await tree1.insert(1, 123);
    await tree1.insert(2, 456);
    await tree1.insert(3, 789);
    await tree1.delete(2);
    expect(await tree1.get(1)).toBe(123);
    expect(await tree1.get(2)).toBeNull();
    expect(await tree1.get(3)).toBe(789);
  });

  it('should update a node', async () => {
    await tree1.insert(1, 123);
    await tree1.update(1, 456);
    expect(await tree1.get(1)).toBe(456);
  });

  it('should update a node with two children', async () => {
    await tree1.insert(1, 123);
    await tree1.insert(2, 456);
    await tree1.insert(3, 789);
    await tree1.update(2, 101112);
    expect(await tree1.get(1)).toBe(123);
    expect(await tree1.get(2)).toBe(101112);
    expect(await tree1.get(3)).toBe(789);
  });

  it('should load a tree from a file', async () => {
    const tree = new HashMap<number>('test.json');
    await tree.whenReady();

    expect(await tree.get(1)).toBe(123);
    expect(await tree.get(2)).toBe(456);
    expect(await tree.get(494849)).toBeNull();
  });

  it('should handle high IO load', async () => {
    const tree = new HashMap<number>(filePath3);
    await tree.whenReady();

    const keys = Array.from({ length: 1000 }, (_, i) => i + 1);
    const values = Array.from({ length: 1000 }, (_, i) => i + 1);

    await Promise.all(
      keys.map((key, index) => tree.insert(key, values[index])),
    );

    for (let i = 0; i < keys.length; i++) {
      expect(await tree.get(keys[i])).toBe(values[i]);
    }

    await Promise.all(
      keys.map((key, index) => tree.update(key, values[index] + 1)),
    );

    for (let i = 0; i < keys.length; i++) {
      expect(await tree.get(keys[i])).toBe(values[i] + 1);
    }

    await Promise.all(keys.map((key) => tree.delete(key)));

    for (let i = 0; i < keys.length; i++) {
      expect(await tree.get(keys[i])).toBeNull();
    }

    await tree.awaitQueueDrain();
  });
});
