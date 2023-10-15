import { EventEmitter } from 'events';

export default class AsyncQueue extends EventEmitter {
  private queue: { id: string; callback: () => Promise<void> }[] = [];
  private isProcessing = false;
  private eventEmitter = new EventEmitter();

  public enqueue(callback: () => Promise<void>): void {
    const id = Math.random().toString(36).slice(2, 9);
    this.queue.push({ id, callback });
    this.eventEmitter.emit('enqueue');
    this.processQueue();
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    while (this.queue.length > 0) {
      const item = this.queue.shift()!;
      const callback = item.callback;
      await callback();
      this.emit('processed', item.id);
    }

    this.isProcessing = false;
    this.emit('idle');
  }

  private async onEnqueue(): Promise<void> {
    if (!this.isProcessing && this.queue.length > 0) {
      await this.processQueue();
    }
  }

  constructor() {
    super();
    this.eventEmitter.on('enqueue', this.onEnqueue.bind(this));
  }
}
