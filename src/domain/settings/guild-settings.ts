import type { VoiceLanguage } from "../voice/voice-command.js";

export interface GuildSettings {
  readonly announcementsEnabled: boolean;
  readonly defaultVolume: number;
  readonly guildId: string;
  readonly idleTimeoutSeconds: number;
  /**
   * Whether spoken "dj <command>" playback commands (wake-word mode and /listen) are acted on.
   * Independent of `voiceSoundsEnabled`: a guild can keep sound/soundboard triggers active while
   * disabling voice control of playback, or vice versa.
   */
  readonly voiceCommandsEnabled: boolean;
  /**
   * Whether the member-join greeting audio actions fire: `voice_member_join` (main bot, via
   * Lavalink) and `voice_listener_member_join` (DiJayMic sidecar) — both trigger when a person
   * enters the voice channel the bot is already active in. Independent of `voiceSoundsEnabled`
   * (spoken triggers) and `voiceCommandsEnabled`, and does not cover `voice_listener_join`
   * (DiJayMic's own auto-join greeting, which fires on the bot arriving, not a person entering).
   */
  readonly voiceJoinGreetingEnabled: boolean;
  /** Language of the voice recognition model/grammar the voice listener should use. */
  readonly voiceLanguage: VoiceLanguage;
  /**
   * Whether spoken sound triggers (audio-action spoken phrases and the native Discord
   * soundboard triggers) fire. Independent of `voiceCommandsEnabled`.
   */
  readonly voiceSoundsEnabled: boolean;
}

export type GuildSettingsUpdate = Partial<
  Pick<
    GuildSettings,
    | "announcementsEnabled"
    | "defaultVolume"
    | "idleTimeoutSeconds"
    | "voiceCommandsEnabled"
    | "voiceJoinGreetingEnabled"
    | "voiceLanguage"
    | "voiceSoundsEnabled"
  >
>;
