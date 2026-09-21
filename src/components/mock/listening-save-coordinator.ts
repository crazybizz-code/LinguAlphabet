/** Tracks Listening autosaves so final submission cannot overtake them. */
export class ListeningSaveCoordinator {
  private readonly pending = new Set<Promise<void>>();

  track(operation: Promise<void>): Promise<void> {
    this.pending.add(operation);
    return operation;
  }

  async drain(): Promise<void> {
    while (this.pending.size > 0) {
      const batch = [...this.pending];
      try {
        await Promise.all(batch);
      } finally {
        for (const operation of batch) this.pending.delete(operation);
      }
    }
  }

  get size(): number {
    return this.pending.size;
  }
}
