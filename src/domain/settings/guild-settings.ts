import type { VoiceLanguage } from "../voice/voice-command.js";

export interface GuildSettings {
  readonly announcementsEnabled: boolean;
  readonly defaultVolume: number;
  readonly guildId: string;
  readonly idleTimeoutSeconds: number;
  /** Language of the voice recognition model/grammar the voice listener should use. */
  readonly voiceLanguage: VoiceLanguage;
}

export type GuildSettingsUpdate = Partial<
  Pick<
    GuildSettings,
    "announcementsEnabled" | "defaultVolume" | "idleTimeoutSeconds" | "voiceLanguage"
  >
>;
