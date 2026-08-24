/**
 * How far a playback smoke check got before it stopped.
 *
 * The stages exist because YouTube playback fails in layers and the interesting failure is
 * the last one: search keeps resolving normally while the stream stage dies, so a check that
 * only resolves metadata reports a false green. See `lavalink/application.yml` for the
 * history behind that.
 */
export type PlaybackCheckStage = "node" | "resolve" | "stream";

/**
 * `skipped` is deliberately distinct from `passed`: it means the check could not prove the
 * stream works (no probe channel configured, or the guild was busy), so the result must not
 * be read as healthy.
 */
export type PlaybackCheckVerdict = "failed" | "passed" | "skipped";

export interface PlaybackCheckResult {
  readonly detail: string;
  readonly durationMs: number;
  readonly reachedStage: PlaybackCheckStage;
  readonly trackTitle: string | null;
  readonly verdict: PlaybackCheckVerdict;
}
