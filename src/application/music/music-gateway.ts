import type {
  LoopMode,
  PlaybackStateSnapshot,
  QueuePlacement,
  Track,
} from "../../domain/music/track.js";

export interface PlaybackRequest {
  readonly guildId: string;
  readonly requesterId: string;
  readonly textChannelId: string;
  readonly voiceChannelId: string;
}

export interface PlayRequest extends PlaybackRequest {
  readonly position: QueuePlacement;
  readonly query: string;
}

export interface EnqueueResult {
  readonly added: readonly Track[];
  readonly playlistName: string | null;
  readonly queueSize: number;
  readonly startedPlaying: boolean;
}

export interface MusicGateway {
  clear(request: PlaybackRequest): Promise<number | null>;
  enqueue(request: PlayRequest): Promise<EnqueueResult>;
  getState(guildId: string): Promise<PlaybackStateSnapshot | null>;
  pause(request: PlaybackRequest): Promise<boolean>;
  remove(request: PlaybackRequest & { readonly position: number }): Promise<Track | null>;
  resolve(query: string, requesterId: string): Promise<readonly Track[]>;
  resume(request: PlaybackRequest): Promise<boolean>;
  seek(request: PlaybackRequest & { readonly positionMs: number }): Promise<boolean>;
  setLoop(request: PlaybackRequest & { readonly mode: LoopMode }): Promise<boolean>;
  setVolume(request: PlaybackRequest & { readonly volume: number }): Promise<boolean>;
  shuffle(request: PlaybackRequest): Promise<number | null>;
  skip(request: PlaybackRequest): Promise<Track | null>;
  stop(request: PlaybackRequest): Promise<boolean>;
}
