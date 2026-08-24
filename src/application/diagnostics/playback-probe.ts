import type { Track } from "../../domain/music/track.js";

export interface StreamProbeRequest {
  readonly guildId: string;
  readonly query: string;
  /** How long to let the track play before reading the position back. */
  readonly settleMs: number;
  /** Give up if the source neither starts nor fails within this window. */
  readonly timeoutMs: number;
  readonly voiceChannelId: string;
}

export interface StreamProbeOutcome {
  /** The source's own failure text (a Lavalink TrackException), or null when none occurred. */
  readonly error: string | null;
  /** Playback position after `settleMs`. Zero means the track started but no audio flowed. */
  readonly positionMs: number;
  readonly started: boolean;
}

/**
 * Port for exercising the real playback path. Implemented against Lavalink; kept behind an
 * interface so the smoke-check logic stays unit-testable without a Discord connection.
 */
export interface PlaybackProbe {
  /** True when a player already exists for the guild, i.e. someone is listening right now. */
  isGuildBusy(guildId: string): boolean;
  isNodeConnected(): boolean;
  /** Joins, plays the query, and reports whether audio actually flowed. Always cleans up. */
  probeStream(request: StreamProbeRequest): Promise<StreamProbeOutcome>;
  resolve(query: string): Promise<readonly Track[]>;
}
