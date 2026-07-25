/**
 * Wire contract for the internal voice-command IPC between the listener sidecar (WI-013) and
 * the main bot. Kept free of any Discord or transport types so both processes can share it.
 */
export const VOICE_COMMAND_PATH = "/voice/command";
export const VOICE_SECRET_HEADER = "x-voice-secret";

export interface VoiceCommandRequestBody {
  readonly guildId: string;
  readonly textChannelId: string;
  readonly transcript: string;
  readonly userId: string;
}

export interface VoiceCommandResponseBody {
  readonly handled: boolean;
  readonly message: string;
}
