import AsyncQueue from './queue';

describe('AsyncQueue', () => {
  it('should execute callbacks in the order they were added', async () => {
    const queue = new AsyncQueue();
    const results: number[] = [];

    queue.enqueue(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      results.push(1);
    });

    queue.enqueue(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      results.push(2);
    });

    queue.enqueue(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      results.push(3);
    });

    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(results).toEqual([1, 2, 3]);
  });

  it('should start processing the queue again before a new item is added', async () => {
    const queue = new AsyncQueue();
    const results: number[] = [];

    queue.enqueue(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      results.push(1);
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    queue.enqueue(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      results.push(2);
    });

    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(results).toEqual([1, 2]);
  });
});
