export type MusicErrorCode =
  | "INVALID_IDLE_TIMEOUT"
  | "INVALID_PLAYLIST_NAME"
  | "INVALID_QUERY"
  | "INVALID_QUEUE_POSITION"
  | "INVALID_SEEK"
  | "INVALID_VOLUME"
  | "LIVE_STREAM_NOT_SEEKABLE"
  | "NOTHING_PLAYING"
  | "NOT_IN_SAME_VOICE_CHANNEL"
  | "PLAYLIST_EXISTS"
  | "PLAYLIST_FULL"
  | "PLAYLIST_NOT_FOUND"
  | "QUEUE_EMPTY"
  | "TRACK_NOT_FOUND"
  | "UNAUTHORIZED_GUILD"
  | "VOICE_CHANNEL_REQUIRED";

export class MusicError extends Error {
  public constructor(
    public readonly code: MusicErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "MusicError";
  }
}
