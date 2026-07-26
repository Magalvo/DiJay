import type { VoiceLanguage } from "../../domain/voice/voice-command.js";

/**
 * Wire contract for the internal voice-command IPC between the listener sidecar (WI-013) and
 * the main bot. Kept free of any Discord or transport types so both processes can share it.
 */
export const VOICE_COMMAND_PATH = "/voice/command";
export const VOICE_LANGUAGE_PATH = "/voice/language";
export const VOICE_SECRET_HEADER = "x-voice-secret";

export interface VoiceCommandRequestBody {
  readonly guildId: string;
  /**
   * Language the listener recognized this transcript in, so the main bot parses it with the
   * matching grammar. Optional for backward compatibility; the bot falls back to its own
   * configured language when absent.
   */
  readonly language?: VoiceLanguage;
  readonly textChannelId: string;
  readonly transcript: string;
  readonly userId: string;
}

export interface VoiceCommandResponseBody {
  readonly handled: boolean;
  readonly message: string;
}

/** Response of the GET language endpoint the listener polls to follow the configured language. */
export interface VoiceLanguageResponseBody {
  readonly language: VoiceLanguage;
}
