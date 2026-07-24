import type { Player, Poru, Response, Track as PoruTrack } from "poru";

import type {
  EnqueueResult,
  MusicGateway,
  PlaybackRequest,
  PlayRequest,
} from "../../application/music/music-gateway.js";
import type { GuildSettingsRepository } from "../../application/settings/guild-settings-repository.js";
import { MusicError } from "../../domain/music/music-error.js";
import type { LoopMode, PlaybackStateSnapshot, Track } from "../../domain/music/track.js";

export class PoruMusicGateway implements MusicGateway {
  public constructor(
    private readonly poru: Poru,
    private readonly settings?: GuildSettingsRepository,
  ) {}

  public async enqueue(request: PlayRequest): Promise<EnqueueResult> {
    const response = await this.resolveWithPoru(request.query, request.requesterId);
    if (response.loadType === "empty" || response.loadType === "error") {
      return this.emptyResult();
    }

    const resolvedTracks =
      response.loadType === "playlist" ? response.tracks : response.tracks.slice(0, 1);
    if (resolvedTracks.length === 0) {
      return this.emptyResult();
    }

    let player = this.poru.get(request.guildId);
    const created = player === null;
    if (player !== null) {
      this.assertVoiceChannel(player, request.voiceChannelId);
      player.setTextChannel(request.textChannelId);
    } else {
      player = this.poru.createConnection({
        deaf: true,
        guildId: request.guildId,
        textChannel: request.textChannelId,
        voiceChannel: request.voiceChannelId,
      });
      if (this.settings !== undefined) {
        const guildSettings = await this.settings.get(request.guildId);
        await player.setVolume(guildSettings.defaultVolume);
      }
    }

    for (const track of resolvedTracks) {
      track.info.requester = request.requesterId;
    }

    const hadCurrent = player.currentTrack !== null || player.isPlaying || player.isPaused;
    if (request.position === "queue") {
      for (const track of resolvedTracks) {
        player.queue.add(track);
      }
    } else {
      player.queue.splice(0, 0, ...resolvedTracks);
    }

    let startedPlaying = false;
    if (request.position === "now" && hadCurrent) {
      await player.skip();
      startedPlaying = true;
    } else if (!player.isPlaying && !player.isPaused) {
      await player.play();
      startedPlaying = true;
    }

    return {
      added: resolvedTracks.map((track) => this.toDomainTrack(track)),
      playlistName: response.playlistInfo.type === "playlist" ? response.playlistInfo.name : null,
      queueSize: player.queue.size + (player.currentTrack === null ? 0 : 1),
      startedPlaying: created || startedPlaying,
    };
  }

  public async resolve(query: string, requesterId: string): Promise<readonly Track[]> {
    const response = await this.resolveWithPoru(query, requesterId);
    if (response.loadType === "empty" || response.loadType === "error") {
      return [];
    }
    return response.tracks.map((track) => this.toDomainTrack(track));
  }

  public getState(guildId: string): Promise<PlaybackStateSnapshot | null> {
    const player = this.poru.get(guildId);
    if (player === null || player.currentTrack === null) {
      return Promise.resolve(null);
    }
    return Promise.resolve({
      current: this.toDomainTrack(player.currentTrack),
      isPaused: player.isPaused,
      loopMode: this.toDomainLoop(player.loop),
      positionMs: player.position,
      upcoming: [...player.queue].map((track) => this.toDomainTrack(track)),
      voiceChannelId: player.voiceChannel,
      volume: player.volume,
    });
  }

  public async pause(request: PlaybackRequest): Promise<boolean> {
    const player = this.getControlledPlayer(request);
    if (player === null || player.currentTrack === null || !player.isPlaying) {
      return false;
    }
    await player.pause(true);
    return true;
  }

  public async resume(request: PlaybackRequest): Promise<boolean> {
    const player = this.getControlledPlayer(request);
    if (player === null || player.currentTrack === null || !player.isPaused) {
      return false;
    }
    await player.pause(false);
    return true;
  }

  public async skip(request: PlaybackRequest): Promise<Track | null> {
    const player = this.getControlledPlayer(request);
    if (player === null || player.currentTrack === null) {
      return null;
    }
    const skipped = this.toDomainTrack(player.currentTrack);
    await player.skip();
    return skipped;
  }

  public async stop(request: PlaybackRequest): Promise<boolean> {
    const player = this.getControlledPlayer(request);
    if (player === null) {
      return false;
    }
    player.queue.clear();
    await player.destroy();
    return true;
  }

  public async setVolume(request: PlaybackRequest & { readonly volume: number }): Promise<boolean> {
    const player = this.getControlledPlayer(request);
    if (player === null || player.currentTrack === null) {
      return false;
    }
    await player.setVolume(request.volume);
    return true;
  }

  public setLoop(request: PlaybackRequest & { readonly mode: LoopMode }): Promise<boolean> {
    const player = this.getControlledPlayer(request);
    if (player === null || player.currentTrack === null) {
      return Promise.resolve(false);
    }
    player.setLoop(this.toPoruLoop(request.mode));
    return Promise.resolve(true);
  }

  public async seek(request: PlaybackRequest & { readonly positionMs: number }): Promise<boolean> {
    const player = this.getControlledPlayer(request);
    if (player === null || player.currentTrack === null) {
      return false;
    }
    await player.seekTo(request.positionMs);
    return true;
  }

  public shuffle(request: PlaybackRequest): Promise<number | null> {
    const player = this.getControlledPlayer(request);
    if (player === null) {
      return Promise.resolve(null);
    }
    const count = player.queue.size;
    player.queue.shuffle();
    return Promise.resolve(count);
  }

  public remove(request: PlaybackRequest & { readonly position: number }): Promise<Track | null> {
    const player = this.getControlledPlayer(request);
    const removed = player?.queue.remove(request.position - 1);
    return Promise.resolve(removed === undefined ? null : this.toDomainTrack(removed));
  }

  public clear(request: PlaybackRequest): Promise<number | null> {
    const player = this.getControlledPlayer(request);
    if (player === null) {
      return Promise.resolve(null);
    }
    return Promise.resolve(player.queue.clear().length);
  }

  private assertVoiceChannel(player: Player, voiceChannelId: string): void {
    if (player.voiceChannel !== voiceChannelId) {
      throw new MusicError(
        "NOT_IN_SAME_VOICE_CHANNEL",
        "Join the bot's voice channel before controlling playback.",
      );
    }
  }

  private emptyResult(): EnqueueResult {
    return {
      added: [],
      playlistName: null,
      queueSize: 0,
      startedPlaying: false,
    };
  }

  private getControlledPlayer(request: PlaybackRequest): Player | null {
    const player = this.poru.get(request.guildId);
    if (player !== null) {
      this.assertVoiceChannel(player, request.voiceChannelId);
    }
    return player;
  }

  private resolveWithPoru(query: string, requesterId: string): Promise<Response> {
    return this.poru.resolve({
      query,
      requester: requesterId,
      source: "ytsearch",
    });
  }

  private toDomainTrack(track: PoruTrack): Track {
    const requester = track.info.requester as unknown;
    return {
      artworkUrl: track.info.artworkUrl ?? null,
      author: track.info.author,
      durationMs: track.info.length,
      isStream: track.info.isStream,
      requesterId:
        typeof requester === "string" ? requester : this.requesterIdFromObject(requester),
      sourceName: track.info.sourceName ?? null,
      title: track.info.title,
      uri: track.info.uri ?? null,
    };
  }

  private requesterIdFromObject(requester: unknown): string | null {
    if (
      typeof requester === "object" &&
      requester !== null &&
      "id" in requester &&
      typeof requester.id === "string"
    ) {
      return requester.id;
    }
    return null;
  }

  private toDomainLoop(loop: Player["loop"]): LoopMode {
    return loop === "TRACK" ? "track" : loop === "QUEUE" ? "queue" : "off";
  }

  private toPoruLoop(loop: LoopMode): Player["loop"] {
    return loop === "track" ? "TRACK" : loop === "queue" ? "QUEUE" : "NONE";
  }
}
