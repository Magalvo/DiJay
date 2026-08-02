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
    | "voiceLanguage"
    | "voiceSoundsEnabled"
  >
>;
