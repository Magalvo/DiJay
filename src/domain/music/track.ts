export interface Track {
  readonly artworkUrl?: string | null;
  readonly author: string;
  readonly durationMs: number;
  readonly isStream: boolean;
  readonly requesterId?: string | null;
  readonly sourceName?: string | null;
  readonly title: string;
  readonly uri: string | null;
}

export interface QueueSnapshot {
  readonly current: Track | null;
  readonly upcoming: readonly Track[];
}

export type LoopMode = "off" | "queue" | "track";
export type QueuePlacement = "next" | "now" | "queue";

export interface PlaybackStateSnapshot extends QueueSnapshot {
  readonly isPaused: boolean;
  readonly loopMode: LoopMode;
  readonly positionMs: number;
  readonly voiceChannelId: string;
  readonly volume: number;
}
