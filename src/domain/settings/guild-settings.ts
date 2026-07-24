export interface GuildSettings {
  readonly announcementsEnabled: boolean;
  readonly defaultVolume: number;
  readonly guildId: string;
  readonly idleTimeoutSeconds: number;
}

export type GuildSettingsUpdate = Partial<
  Pick<GuildSettings, "announcementsEnabled" | "defaultVolume" | "idleTimeoutSeconds">
>;
