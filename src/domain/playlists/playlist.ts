import type { Track } from "../music/track.js";

export interface PlaylistTrack {
  readonly position: number;
  readonly track: Track;
}

export interface Playlist {
  readonly createdBy: string;
  readonly guildId: string;
  readonly name: string;
  readonly tracks: readonly PlaylistTrack[];
}

export interface PlaylistPlaybackResult {
  readonly added: number;
  readonly failed: number;
}
