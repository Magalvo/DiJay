export class IdlePlayerManager {
  private readonly timers = new Map<string, NodeJS.Timeout>();

  public cancel(guildId: string): void {
    const timer = this.timers.get(guildId);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.timers.delete(guildId);
    }
  }

  public clear(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }

  public has(guildId: string): boolean {
    return this.timers.has(guildId);
  }

  public schedule(
    guildId: string,
    delaySeconds: number,
    callback: () => void | Promise<void>,
  ): void {
    this.cancel(guildId);
    const timer = setTimeout(() => {
      this.timers.delete(guildId);
      void Promise.resolve(callback());
    }, delaySeconds * 1_000);
    timer.unref();
    this.timers.set(guildId, timer);
  }
}
