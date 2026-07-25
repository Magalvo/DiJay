import type { PlaybackRequest } from "../music/music-gateway.js";
import type { MusicService } from "../music/music-service.js";
import { MusicError } from "../../domain/music/music-error.js";
import type {
  Playlist,
  PlaylistPlaybackResult,
  PlaylistTrack,
} from "../../domain/playlists/playlist.js";
import type { PlaylistRepository } from "./playlist-repository.js";

const MAX_PLAYLIST_NAME_LENGTH = 40;

// Errors that mean no track in the playlist could ever be queued (the caller is not in the
// bot's voice channel, or the guild is not allowed). These abort the whole load; every other
// per-track failure is transient or track-specific and is counted as `failed` so the rest of
// the playlist still loads.
const ABORTING_CODES = new Set<MusicError["code"]>([
  "NOT_IN_SAME_VOICE_CHANNEL",
  "VOICE_CHANNEL_REQUIRED",
  "UNAUTHORIZED_GUILD",
]);

export class PlaylistService {
  public constructor(
    private readonly repository: PlaylistRepository,
    private readonly music: MusicService,
  ) {}

  public create(guildId: string, name: string, createdBy: string): Promise<Playlist> {
    return this.repository.create(guildId, this.validName(name), createdBy);
  }

  public list(guildId: string): Promise<readonly Playlist[]> {
    return this.repository.list(guildId);
  }

  public async get(guildId: string, name: string): Promise<Playlist> {
    const playlist = await this.repository.getByName(guildId, this.validName(name));
    if (playlist === null) {
      throw this.notFound();
    }
    return playlist;
  }

  public async add(
    guildId: string,
    name: string,
    query: string,
    requesterId: string,
  ): Promise<PlaylistTrack> {
    await this.get(guildId, name);
    const tracks = await this.music.resolve(query, requesterId);
    return this.repository.addTrack(guildId, this.validName(name), tracks[0]!);
  }

  public async remove(guildId: string, name: string, position: number): Promise<PlaylistTrack> {
    if (!Number.isInteger(position) || position < 1) {
      throw new MusicError("INVALID_QUEUE_POSITION", "Playlist positions start at 1.");
    }
    const removed = await this.repository.removeTrack(guildId, this.validName(name), position);
    if (removed === null) {
      throw new MusicError("INVALID_QUEUE_POSITION", "That playlist position does not exist.");
    }
    return removed;
  }

  public async delete(guildId: string, name: string): Promise<void> {
    if (!(await this.repository.delete(guildId, this.validName(name)))) {
      throw this.notFound();
    }
  }

  public async play(request: PlaybackRequest, name: string): Promise<PlaylistPlaybackResult> {
    const playlist = await this.get(request.guildId, name);
    let added = 0;
    let failed = 0;

    for (const item of playlist.tracks) {
      const query = item.track.uri ?? `${item.track.author} - ${item.track.title}`;
      try {
        const result = await this.music.play({ ...request, position: "queue", query });
        added += result.added.length;
      } catch (error) {
        if (error instanceof MusicError && ABORTING_CODES.has(error.code)) {
          throw error;
        }
        // Track-specific (not found, invalid) or transient (Lavalink hiccup) failure: skip
        // this track and keep loading the rest instead of dropping the whole playlist.
        failed += 1;
      }
    }

    if (added === 0) {
      throw new MusicError("TRACK_NOT_FOUND", "No playlist tracks are currently available.");
    }
    return { added, failed };
  }

  private notFound(): MusicError {
    return new MusicError("PLAYLIST_NOT_FOUND", "Playlist not found.");
  }

  private validName(rawName: string): string {
    const name = rawName.trim().replace(/\s+/g, " ");
    if (name.length === 0 || name.length > MAX_PLAYLIST_NAME_LENGTH) {
      throw new MusicError(
        "INVALID_PLAYLIST_NAME",
        `Playlist names must contain between 1 and ${MAX_PLAYLIST_NAME_LENGTH} characters.`,
      );
    }
    return name;
  }
}
