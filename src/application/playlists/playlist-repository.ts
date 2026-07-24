import type { Track } from "../../domain/music/track.js";
import type { Playlist, PlaylistTrack } from "../../domain/playlists/playlist.js";

export interface PlaylistRepository {
  addTrack(guildId: string, name: string, track: Track): Promise<PlaylistTrack>;
  create(guildId: string, name: string, createdBy: string): Promise<Playlist>;
  delete(guildId: string, name: string): Promise<boolean>;
  getByName(guildId: string, name: string): Promise<Playlist | null>;
  list(guildId: string): Promise<readonly Playlist[]>;
  removeTrack(guildId: string, name: string, position: number): Promise<PlaylistTrack | null>;
}
