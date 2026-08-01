export interface SelfHealWatchdogDeps {
  readonly checkIntervalMs?: number;
  readonly gracePeriodMs: number;
  readonly isHealthy: () => boolean;
  readonly now?: () => number;
  readonly onUnhealthy: (unhealthyForMs: number) => void;
}

const DEFAULT_CHECK_INTERVAL_MS = 30_000;

/**
 * Backstop for a process that is alive but stuck: if `isHealthy` stays false for at least
 * `gracePeriodMs`, `onUnhealthy` fires once for that unhealthy episode. Docker's own HEALTHCHECK
 * does not restart a running-but-unhealthy container on its own — a `restart` policy only
 * triggers once the process actually exits — so callers typically use `onUnhealthy` to log a
 * full diagnostic and call `process.exit(1)`, letting the existing `restart: unless-stopped`
 * policy recover the container. `onUnhealthy` does not fire again until health recovers and is
 * lost again, so a caller that chooses not to exit does not get spammed every check interval.
 */
export class SelfHealWatchdog {
  private readonly checkIntervalMs: number;
  private readonly now: () => number;
  private notified = false;
  private timer: ReturnType<typeof setInterval> | undefined;
  private unhealthySince: number | null = null;

  public constructor(private readonly deps: SelfHealWatchdogDeps) {
    this.now = deps.now ?? Date.now;
    this.checkIntervalMs = deps.checkIntervalMs ?? DEFAULT_CHECK_INTERVAL_MS;
  }

  public start(): void {
    if (this.timer !== undefined) {
      return;
    }
    this.timer = setInterval(() => this.check(), this.checkIntervalMs);
    this.timer.unref();
  }

  public stop(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  /** Runs one evaluation immediately. Exposed so tests drive it without real timers. */
  public check(): void {
    if (this.deps.isHealthy()) {
      this.unhealthySince = null;
      this.notified = false;
      return;
    }
    if (this.unhealthySince === null) {
      this.unhealthySince = this.now();
      return;
    }
    const unhealthyForMs = this.now() - this.unhealthySince;
    if (unhealthyForMs >= this.deps.gracePeriodMs && !this.notified) {
      this.notified = true;
      this.deps.onUnhealthy(unhealthyForMs);
    }
  }
}
