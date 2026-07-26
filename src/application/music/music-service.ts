import { MusicError } from "../../domain/music/music-error.js";
import type {
  LoopMode,
  PlaybackStateSnapshot,
  QueueSnapshot,
  Track,
} from "../../domain/music/track.js";
import type {
  EnqueueResult,
  MusicGateway,
  PlaybackRequest,
  PlayRequest,
  SystemPlaybackRequest,
  SystemPlaybackResult,
  TrackSelection,
} from "./music-gateway.js";

const MAX_QUERY_LENGTH = 500;

export class MusicService {
  public constructor(private readonly gateway: MusicGateway) {}

  public async play(request: PlayRequest): Promise<EnqueueResult> {
    const query = this.validQuery(request.query);

    const result = await this.gateway.enqueue({ ...request, query });

    if (result.added.length === 0) {
      throw new MusicError("TRACK_NOT_FOUND", "No tracks matched the query.");
    }

    return result;
  }

  public playSystemAudioAction(request: SystemPlaybackRequest): Promise<SystemPlaybackResult> {
    return this.gateway.enqueueSystem({ ...request, query: this.validQuery(request.query) });
  }

  public async resolve(query: string, requesterId: string): Promise<readonly Track[]> {
    const tracks = await this.gateway.resolve(this.validQuery(query), requesterId);
    if (tracks.length === 0) {
      throw new MusicError("TRACK_NOT_FOUND", "No tracks matched the query.");
    }
    return tracks;
  }

  /**
   * Resolves a query into the tracks it should contribute to a playlist: every track of a
   * playlist/album URL, or just the top hit for a plain search. Unlike `resolve`, an empty
   * result is returned rather than thrown, so callers can report it in their own words.
   */
  public resolveSelection(query: string, requesterId: string): Promise<TrackSelection> {
    return this.gateway.resolveSelection(this.validQuery(query), requesterId);
  }

  public getState(guildId: string): Promise<PlaybackStateSnapshot | null> {
    return this.gateway.getState(guildId);
  }

  public async getQueue(guildId: string): Promise<QueueSnapshot | null> {
    const state = await this.getState(guildId);
    return state === null ? null : { current: state.current, upcoming: state.upcoming };
  }

  public async pause(request: PlaybackRequest): Promise<void> {
    if (!(await this.gateway.pause(request))) {
      throw this.nothingPlaying();
    }
  }

  public async resume(request: PlaybackRequest): Promise<void> {
    if (!(await this.gateway.resume(request))) {
      throw this.nothingPlaying();
    }
  }

  public async skip(request: PlaybackRequest): Promise<Track> {
    const skipped = await this.gateway.skip(request);
    if (skipped === null) {
      throw this.nothingPlaying();
    }
    return skipped;
  }

  public async stop(request: PlaybackRequest): Promise<void> {
    if (!(await this.gateway.stop(request))) {
      throw this.nothingPlaying();
    }
  }

  public async setVolume(request: PlaybackRequest & { readonly volume: number }): Promise<void> {
    if (!Number.isInteger(request.volume) || request.volume < 0 || request.volume > 150) {
      throw new MusicError("INVALID_VOLUME", "Volume must be an integer between 0 and 150.");
    }
    if (!(await this.gateway.setVolume(request))) {
      throw this.nothingPlaying();
    }
  }

  public async setLoop(request: PlaybackRequest & { readonly mode: LoopMode }): Promise<void> {
    if (!(await this.gateway.setLoop(request))) {
      throw this.nothingPlaying();
    }
  }

  public async seek(request: PlaybackRequest & { readonly positionMs: number }): Promise<void> {
    const state = await this.gateway.getState(request.guildId);
    if (state === null || state.current === null) {
      throw this.nothingPlaying();
    }
    if (state.voiceChannelId !== request.voiceChannelId) {
      throw new MusicError(
        "NOT_IN_SAME_VOICE_CHANNEL",
        "Join the bot's voice channel before controlling playback.",
      );
    }
    if (state.current.isStream) {
      throw new MusicError("LIVE_STREAM_NOT_SEEKABLE", "Live streams cannot be seeked.");
    }
    if (
      !Number.isInteger(request.positionMs) ||
      request.positionMs < 0 ||
      request.positionMs >= state.current.durationMs
    ) {
      throw new MusicError("INVALID_SEEK", "Seek position is outside the current track.");
    }
    if (!(await this.gateway.seek(request))) {
      throw this.nothingPlaying();
    }
  }

  public async shuffle(request: PlaybackRequest): Promise<number> {
    const count = await this.gateway.shuffle(request);
    if (count === null) {
      throw this.nothingPlaying();
    }
    if (count < 2) {
      throw new MusicError("QUEUE_EMPTY", "There are not enough upcoming tracks to shuffle.");
    }
    return count;
  }

  public async remove(request: PlaybackRequest & { readonly position: number }): Promise<Track> {
    if (!Number.isInteger(request.position) || request.position < 1) {
      throw new MusicError("INVALID_QUEUE_POSITION", "Queue positions start at 1.");
    }
    const track = await this.gateway.remove(request);
    if (track === null) {
      throw new MusicError("INVALID_QUEUE_POSITION", "That queue position does not exist.");
    }
    return track;
  }

  public async clear(request: PlaybackRequest): Promise<number> {
    const count = await this.gateway.clear(request);
    if (count === null) {
      throw this.nothingPlaying();
    }
    return count;
  }

  private nothingPlaying(): MusicError {
    return new MusicError("NOTHING_PLAYING", "There is no active playback in this server.");
  }

  private validQuery(rawQuery: string): string {
    const query = rawQuery.trim();
    if (query.length === 0 || query.length > MAX_QUERY_LENGTH) {
      throw new MusicError(
        "INVALID_QUERY",
        `The query must contain between 1 and ${MAX_QUERY_LENGTH} characters.`,
      );
    }
    return query;
  }
}
