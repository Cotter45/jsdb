import { EventEmitter } from 'events';

export class AsyncQueue extends EventEmitter {
  queue: { callback: () => Promise<any> }[] = [];
  isProcessing = false;

  constructor() {
    super();
    this.on('enqueue', this.onEnqueue.bind(this));
  }

  public enqueue(callback: () => Promise<any>): void {
    this.queue.push({ callback });
    this.emit('enqueue');
  }

  async processQueue(): Promise<void> {
    this.isProcessing = true;

    while (this.queue.length > 0) {
      const item = this.queue.shift()!;
      try {
        const result = await item.callback();
        this.emit('processed', result);
      } catch (error) {
        this.emit('error', error);
      }
    }

    this.isProcessing = false;
    this.emit('idle');
  }

  async onEnqueue(): Promise<void> {
    if (!this.isProcessing && this.queue.length > 0) {
      await this.processQueue();
    }
  }
}
