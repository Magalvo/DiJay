import type { DatabaseSync } from "node:sqlite";

import type { PlaylistRepository } from "../../application/playlists/playlist-repository.js";
import { MusicError } from "../../domain/music/music-error.js";
import type { Track } from "../../domain/music/track.js";
import type {
  Playlist,
  PlaylistImportResult,
  PlaylistTrack,
} from "../../domain/playlists/playlist.js";
import { withTransaction } from "./database.js";

const MAX_PLAYLIST_TRACKS = 100;

interface PlaylistRow {
  created_by: string;
  display_name: string;
  guild_id: string;
  id: number;
}

interface TrackRow {
  author: string;
  duration_ms: number;
  is_stream: number;
  position: number;
  source_uri: string | null;
  title: string;
}

export class SqlitePlaylistRepository implements PlaylistRepository {
  public constructor(private readonly database: DatabaseSync) {}

  public async create(guildId: string, name: string, createdBy: string): Promise<Playlist> {
    try {
      this.database
        .prepare(
          `INSERT INTO playlists(
             guild_id, normalized_name, display_name, created_by, created_at
           ) VALUES (?, ?, ?, ?, ?)`,
        )
        .run(guildId, this.normalize(name), name.trim(), createdBy, new Date().toISOString());
    } catch (error) {
      if (error instanceof Error && error.message.includes("UNIQUE constraint")) {
        throw new MusicError("PLAYLIST_EXISTS", "A playlist with that name already exists.");
      }
      throw error;
    }
    return this.required(guildId, name);
  }

  public list(guildId: string): Promise<readonly Playlist[]> {
    const rows = this.database
      .prepare(
        `SELECT id, guild_id, display_name, created_by
         FROM playlists WHERE guild_id = ? ORDER BY normalized_name`,
      )
      .all(guildId) as unknown as PlaylistRow[];
    return Promise.resolve(rows.map((row) => this.mapPlaylist(row)));
  }

  public getByName(guildId: string, name: string): Promise<Playlist | null> {
    const row = this.findRow(guildId, name);
    return Promise.resolve(row === undefined ? null : this.mapPlaylist(row));
  }

  public delete(guildId: string, name: string): Promise<boolean> {
    const result = this.database
      .prepare("DELETE FROM playlists WHERE guild_id = ? AND normalized_name = ?")
      .run(guildId, this.normalize(name));
    return Promise.resolve(result.changes > 0);
  }

  public addTrack(guildId: string, name: string, track: Track): Promise<PlaylistTrack> {
    return Promise.resolve().then(() => {
      const playlist = this.findRow(guildId, name);
      if (playlist === undefined) {
        throw new MusicError("PLAYLIST_NOT_FOUND", "Playlist not found.");
      }
      return withTransaction(this.database, () => {
        const countRow = this.database
          .prepare("SELECT COUNT(*) AS count FROM playlist_tracks WHERE playlist_id = ?")
          .get(playlist.id) as unknown as { count: number };
        if (countRow.count >= MAX_PLAYLIST_TRACKS) {
          throw new MusicError("PLAYLIST_FULL", "A playlist can contain at most 100 tracks.");
        }
        const position = countRow.count + 1;
        this.database
          .prepare(
            `INSERT INTO playlist_tracks(
               playlist_id, position, title, author, source_uri, duration_ms, is_stream
             ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            playlist.id,
            position,
            track.title,
            track.author,
            track.uri,
            track.durationMs,
            track.isStream ? 1 : 0,
          );
        return { position, track };
      });
    });
  }

  public addTracks(
    guildId: string,
    name: string,
    tracks: readonly Track[],
  ): Promise<PlaylistImportResult> {
    return Promise.resolve().then(() => {
      const playlist = this.findRow(guildId, name);
      if (playlist === undefined) {
        throw new MusicError("PLAYLIST_NOT_FOUND", "Playlist not found.");
      }
      return withTransaction(this.database, () => {
        const countRow = this.database
          .prepare("SELECT COUNT(*) AS count FROM playlist_tracks WHERE playlist_id = ?")
          .get(playlist.id) as unknown as { count: number };
        const insert = this.database.prepare(
          `INSERT INTO playlist_tracks(
             playlist_id, position, title, author, source_uri, duration_ms, is_stream
           ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        );
        const capacity = MAX_PLAYLIST_TRACKS - countRow.count;
        const added: PlaylistTrack[] = [];
        for (const track of tracks) {
          if (added.length >= capacity) {
            break;
          }
          const position = countRow.count + added.length + 1;
          insert.run(
            playlist.id,
            position,
            track.title,
            track.author,
            track.uri,
            track.durationMs,
            track.isStream ? 1 : 0,
          );
          added.push({ position, track });
        }
        return { added, skipped: tracks.length - added.length };
      });
    });
  }

  public removeTrack(
    guildId: string,
    name: string,
    position: number,
  ): Promise<PlaylistTrack | null> {
    return Promise.resolve().then(() => {
      const playlist = this.findRow(guildId, name);
      if (playlist === undefined) {
        throw new MusicError("PLAYLIST_NOT_FOUND", "Playlist not found.");
      }
      return withTransaction(this.database, () => {
        const row = this.database
          .prepare(
            `SELECT position, title, author, source_uri, duration_ms, is_stream
             FROM playlist_tracks WHERE playlist_id = ? AND position = ?`,
          )
          .get(playlist.id, position) as unknown as TrackRow | undefined;
        if (row === undefined) {
          return null;
        }
        this.database
          .prepare("DELETE FROM playlist_tracks WHERE playlist_id = ? AND position = ?")
          .run(playlist.id, position);
        this.database
          .prepare(
            `UPDATE playlist_tracks SET position = position - 1
             WHERE playlist_id = ? AND position > ?`,
          )
          .run(playlist.id, position);
        return this.mapTrack(row);
      });
    });
  }

  private findRow(guildId: string, name: string): PlaylistRow | undefined {
    return this.database
      .prepare(
        `SELECT id, guild_id, display_name, created_by
         FROM playlists WHERE guild_id = ? AND normalized_name = ?`,
      )
      .get(guildId, this.normalize(name)) as unknown as PlaylistRow | undefined;
  }

  private mapPlaylist(row: PlaylistRow): Playlist {
    const tracks = this.database
      .prepare(
        `SELECT position, title, author, source_uri, duration_ms, is_stream
         FROM playlist_tracks WHERE playlist_id = ? ORDER BY position`,
      )
      .all(row.id) as unknown as TrackRow[];
    return {
      createdBy: row.created_by,
      guildId: row.guild_id,
      name: row.display_name,
      tracks: tracks.map((track) => this.mapTrack(track)),
    };
  }

  private mapTrack(row: TrackRow): PlaylistTrack {
    return {
      position: row.position,
      track: {
        author: row.author,
        durationMs: row.duration_ms,
        isStream: row.is_stream === 1,
        title: row.title,
        uri: row.source_uri,
      },
    };
  }

  private normalize(name: string): string {
    return name.trim().replace(/\s+/g, " ").normalize("NFKC").toLocaleLowerCase("pt-PT");
  }

  private async required(guildId: string, name: string): Promise<Playlist> {
    const playlist = await this.getByName(guildId, name);
    if (playlist === null) {
      throw new MusicError("PLAYLIST_NOT_FOUND", "Playlist not found.");
    }
    return playlist;
  }
}
