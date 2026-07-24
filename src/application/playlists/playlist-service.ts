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
        if (error instanceof MusicError && error.code === "TRACK_NOT_FOUND") {
          failed += 1;
          continue;
        }
        throw error;
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
