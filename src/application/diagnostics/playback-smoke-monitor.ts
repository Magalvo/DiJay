import type { PlaybackCheckResult } from "../../domain/diagnostics/playback-check.js";
import type { PlaybackSmokeCheck } from "./playback-smoke-check.js";

export type SmokeAlertKind = "failing" | "recovered";

export interface SmokeAlertSink {
  report(result: PlaybackCheckResult, kind: SmokeAlertKind): Promise<void>;
}

/**
 * Runs the smoke check and alerts only when the verdict changes.
 *
 * Alerting on every failed run would post the same message on every interval until someone
 * fixed it, which trains people to ignore it. Reporting the transitions instead means one
 * message when playback breaks and one when it comes back.
 *
 * A `skipped` run carries no information about health, so it never triggers or clears an
 * alert; it leaves the previous state untouched.
 */
export class PlaybackSmokeMonitor {
  private failing = false;

  public constructor(
    private readonly check: PlaybackSmokeCheck,
    private readonly sink: SmokeAlertSink,
  ) {}

  public async runOnce(): Promise<PlaybackCheckResult> {
    const result = await this.check.run();

    if (result.verdict === "failed" && !this.failing) {
      this.failing = true;
      await this.sink.report(result, "failing");
    } else if (result.verdict === "passed" && this.failing) {
      this.failing = false;
      await this.sink.report(result, "recovered");
    }

    return result;
  }
}
