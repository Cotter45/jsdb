import { AsyncQueue } from './queue';

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

  it('should emit an event when an item is added to the queue', async () => {
    const queue = new AsyncQueue();
    const results: number[] = [];

    queue.on('enqueue', () => {
      results.push(1);
    });

    queue.enqueue(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      results.push(2);
    });

    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(results).toEqual([1, 2]);
  });

  it('should emit an event when an item is processed', async () => {
    const queue = new AsyncQueue();
    const results: any[] = [];

    queue.on('processed', () => {
      results.push('processed');
    });

    queue.enqueue(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      results.push(1);
    });

    queue.enqueue(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      results.push(2);
    });

    await new Promise((resolve) => setTimeout(resolve, 250));

    expect(results).toEqual([1, 'processed', 2, 'processed']);

    queue.enqueue(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      results.push(3);
    });

    queue.enqueue(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      results.push(4);
    });

    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(results).toEqual([
      1,
      'processed',
      2,
      'processed',
      3,
      'processed',
      4,
      'processed',
    ]);
  });

  it('should emit an idle event when the queue becomes empty', async () => {
    const queue = new AsyncQueue();
    const idleEventEmitted = jest.fn();

    queue.on('idle', idleEventEmitted);

    queue.enqueue(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(idleEventEmitted).toHaveBeenCalledTimes(1);
  });

  it('should not process tasks if the queue is empty', async () => {
    const queue = new AsyncQueue();
    const processSpy = jest.spyOn(queue, 'processQueue');

    await queue.processQueue();

    expect(processSpy).toHaveBeenCalledTimes(1);
    expect(queue.queue.length).toBe(0);
  });

  it('should handle task errors without stopping the queue', async () => {
    const queue = new AsyncQueue();
    const results: any[] = [];
    const errorHandlingTask = async () => {
      throw new Error('Task error');
    };

    queue.on('error', () => {
      results.push('error');
    });

    queue.enqueue(errorHandlingTask);
    queue.enqueue(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      results.push(1);
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(results[0]).toEqual('error');
    expect(results[1]).toEqual(1);
  });
});
