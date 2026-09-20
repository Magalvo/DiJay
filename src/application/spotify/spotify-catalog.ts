/** One track as Spotify describes it, before it is matched to anything playable. */
export interface SpotifyCatalogTrack {
  readonly artist: string;
  readonly durationMs: number;
  /**
   * International Standard Recording Code: identifies the exact recording, not the song. It is
   * what lets the import find the same master on YouTube instead of a cover, a live take or a
   * shortened video edit. Null for tracks Spotify has no ISRC for (local files, some uploads).
   */
  readonly isrc: string | null;
  readonly title: string;
}

export interface SpotifyCatalogPlaylist {
  readonly name: string;
  /** How many tracks the playlist holds upstream, which can exceed `tracks.length`. */
  readonly total: number;
  readonly tracks: readonly SpotifyCatalogTrack[];
}

/**
 * Reads playlist contents from Spotify.
 *
 * Deliberately narrow: the bot needs a track list and nothing else. Playback never goes through
 * Spotify - the import resolves every track to a playable source up front - so this port has no
 * concept of streaming, audio, or playback state.
 */
export interface SpotifyCatalog {
  /**
   * Resolves a playlist by share URL, `spotify:playlist:` URI, or bare id, returning at most
   * `limit` tracks.
   */
  getPlaylist(reference: string, limit: number): Promise<SpotifyCatalogPlaylist>;
}
