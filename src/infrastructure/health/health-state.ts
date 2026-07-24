export interface HealthSnapshot {
  readonly checks: {
    readonly discord: boolean;
    readonly lavalink: boolean;
  };
  readonly healthy: boolean;
  readonly status: "degraded" | "ready" | "shutting_down";
}

export class HealthState {
  private discordReady = false;
  private lavalinkReady = false;
  private shuttingDown = false;

  public beginShutdown(): void {
    this.shuttingDown = true;
  }

  public setDiscordReady(ready: boolean): void {
    this.discordReady = ready;
  }

  public setLavalinkReady(ready: boolean): void {
    this.lavalinkReady = ready;
  }

  public snapshot(): HealthSnapshot {
    const healthy = !this.shuttingDown && this.discordReady && this.lavalinkReady;
    return {
      checks: {
        discord: this.discordReady,
        lavalink: this.lavalinkReady,
      },
      healthy,
      status: this.shuttingDown ? "shutting_down" : healthy ? "ready" : "degraded",
    };
  }
}
