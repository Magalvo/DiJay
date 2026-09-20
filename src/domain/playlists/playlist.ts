import type { Track } from "../music/track.js";

/**
 * Hard cap on how many tracks one saved playlist holds.
 *
 * Sized to LavaSrc's own ceiling rather than picked round: it reads a Spotify playlist in pages
 * of 100 and stops after `playlistLoadLimit` pages (6, in lavalink/application.yml), so 600 is
 * the most an import can ever deliver. Matching the two means nothing LavaSrc resolves is
 * dropped on the way into storage.
 *
 * Raising it past 600 is not free: `/playlist play` re-resolves every stored track through
 * Lavalink one at a time, so the cap also bounds how long that command runs.
 */
export const MAX_PLAYLIST_TRACKS = 600;

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

export interface SpotifyImportResult {
  /** Tracks stored, after matching and after the playlist cap. */
  readonly added: number;
  /** Tracks Spotify listed but no playable match was found for. */
  readonly unmatched: number;
  /** Tracks matched but dropped because the playlist hit MAX_PLAYLIST_TRACKS. */
  readonly skipped: number;
  /** The playlist name as Spotify has it, for the confirmation message. */
  readonly sourceName: string;
  /** How many tracks the Spotify playlist holds upstream. */
  readonly sourceTotal: number;
}

export interface PlaylistImportResult {
  readonly added: readonly PlaylistTrack[];
  readonly skipped: number;
}
