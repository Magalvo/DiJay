import type { VoiceLanguage } from "../../domain/voice/voice-command.js";

/**
 * Wire contract for the internal voice-command IPC between the listener sidecar (WI-013) and
 * the main bot. Kept free of any Discord or transport types so both processes can share it.
 */
export const VOICE_COMMAND_PATH = "/voice/command";
export const VOICE_SETTINGS_PATH = "/voice/settings";
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

/**
 * Response of the GET settings endpoint the listener polls to follow /settings changes live:
 * the recognition language, and the independent voice toggles (playback commands, sound/
 * soundboard triggers, and member-join greetings).
 */
export interface VoiceListenerSettingsResponseBody {
  readonly commandsEnabled: boolean;
  readonly joinGreetingEnabled: boolean;
  readonly language: VoiceLanguage;
  readonly soundsEnabled: boolean;
}
