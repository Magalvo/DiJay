import type {
  SpotifyCatalog,
  SpotifyCatalogPlaylist,
  SpotifyCatalogTrack,
} from "../../application/spotify/spotify-catalog.js";
import { MusicError } from "../../domain/music/music-error.js";

const ACCOUNTS_URL = "https://accounts.spotify.com/api/token";
const API_BASE = "https://api.spotify.com/v1";
/** Spotify's own maximum for this endpoint; asking for more is rejected, not truncated. */
const PAGE_SIZE = 100;
/** Refresh slightly early so a token cannot expire between the check and the request. */
const EXPIRY_MARGIN_MS = 30_000;

const PLAYLIST_REFERENCE =
  /(?:open\.spotify\.com\/(?:[a-zA-Z-]+\/)?playlist\/|spotify:playlist:)?([a-zA-Z0-9]{22})/;

export interface SpotifyWebApiCredentials {
  readonly clientId: string;
  readonly clientSecret: string;
  /**
   * A user refresh token, not client credentials. Playlist contents are only readable as the
   * account that owns the playlist: with an app-only token Spotify answers 200 for the playlist
   * but omits its items, and 401/403 for the items endpoint itself.
   */
  readonly refreshToken: string;
}

interface TokenResponse {
  readonly access_token?: string;
  readonly expires_in?: number;
}

interface PlaylistItemsPage {
  readonly items?: readonly {
    readonly track?: SpotifyApiTrack | null;
    readonly item?: SpotifyApiTrack | null;
  }[];
  readonly total?: number;
}

interface SpotifyApiTrack {
  readonly artists?: readonly { readonly name?: string }[];
  readonly duration_ms?: number;
  readonly external_ids?: { readonly isrc?: string };
  readonly is_local?: boolean;
  readonly name?: string;
  readonly type?: string;
}

/**
 * Reads playlists through Spotify's Web API on behalf of the account that linked itself.
 *
 * Scope is narrower than it looks, and the narrowing is Spotify's, not ours: an app in
 * Development Mode only receives playlist items for playlists the authenticated user owns or
 * collaborates on. Other people's public playlists answer 403 and Spotify-generated ones
 * (`37i9dQZ...`) answer 404, both verified against the live API. Those are reported as
 * SPOTIFY_PLAYLIST_UNAVAILABLE rather than dressed up as an internal failure.
 */
export class SpotifyWebApiCatalog implements SpotifyCatalog {
  private accessToken: string | null = null;
  private expiresAt = 0;

  public constructor(
    private readonly credentials: SpotifyWebApiCredentials,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  public async getPlaylist(reference: string, limit: number): Promise<SpotifyCatalogPlaylist> {
    const id = this.playlistId(reference);
    const details = await this.request<{ name?: string }>(`/playlists/${id}?fields=name`);
    const tracks: SpotifyCatalogTrack[] = [];
    let total = 0;

    for (let offset = 0; offset < limit; offset += PAGE_SIZE) {
      const size = Math.min(PAGE_SIZE, limit - offset);
      const page = await this.request<PlaylistItemsPage>(
        `/playlists/${id}/items?limit=${size}&offset=${offset}`,
      );
      total = page.total ?? total;
      const entries = page.items ?? [];
      for (const entry of entries) {
        // The March 2026 API migration renamed `track` to `item` on this endpoint. Accepting
        // both keeps this working whichever field the account's app is served.
        const track = entry.track ?? entry.item;
        // Episodes and removed tracks come through as null or a non-track type; local files
        // have no id upstream and cannot be matched to anything playable.
        if (track == null || (track.type !== undefined && track.type !== "track")) {
          continue;
        }
        tracks.push({
          artist: track.artists?.[0]?.name ?? "",
          durationMs: track.duration_ms ?? 0,
          isrc: track.is_local === true ? null : (track.external_ids?.isrc ?? null),
          title: track.name ?? "",
        });
      }
      if (entries.length < size) {
        break;
      }
    }

    return { name: details.name ?? "Spotify", total: total || tracks.length, tracks };
  }

  private playlistId(reference: string): string {
    const match = PLAYLIST_REFERENCE.exec(reference.trim());
    if (match?.[1] === undefined) {
      throw new MusicError("INVALID_SPOTIFY_REFERENCE", "Not a Spotify playlist reference.");
    }
    return match[1];
  }

  private async request<T>(path: string): Promise<T> {
    const response = await this.fetchImpl(API_BASE + path, {
      headers: { Authorization: `Bearer ${await this.token()}` },
    });
    if (response.status === 403 || response.status === 404) {
      throw new MusicError(
        "SPOTIFY_PLAYLIST_UNAVAILABLE",
        `Spotify refused the playlist with ${response.status}.`,
      );
    }
    if (!response.ok) {
      throw new MusicError("SPOTIFY_UNAVAILABLE", `Spotify answered ${response.status}.`);
    }
    return (await response.json()) as T;
  }

  private async token(): Promise<string> {
    if (this.accessToken !== null && this.now() < this.expiresAt) {
      return this.accessToken;
    }
    const basic = Buffer.from(
      `${this.credentials.clientId}:${this.credentials.clientSecret}`,
    ).toString("base64");
    const response = await this.fetchImpl(ACCOUNTS_URL, {
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: this.credentials.refreshToken,
      }),
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      method: "POST",
    });
    const body = response.ok ? ((await response.json()) as TokenResponse) : {};
    if (body.access_token === undefined) {
      // A revoked or rotated refresh token lands here. Distinguished from a transient outage so
      // the operator is told to redo the authorisation instead of waiting for it to pass.
      this.accessToken = null;
      throw new MusicError(
        "SPOTIFY_NOT_AUTHORISED",
        `Could not refresh the Spotify token (${response.status}).`,
      );
    }
    this.accessToken = body.access_token;
    this.expiresAt = this.now() + (body.expires_in ?? 3_600) * 1_000 - EXPIRY_MARGIN_MS;
    return this.accessToken;
  }
}
