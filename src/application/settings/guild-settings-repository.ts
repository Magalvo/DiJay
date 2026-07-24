import type { GuildSettings, GuildSettingsUpdate } from "../../domain/settings/guild-settings.js";

export interface GuildSettingsRepository {
  get(guildId: string): Promise<GuildSettings>;
  update(guildId: string, update: GuildSettingsUpdate): Promise<GuildSettings>;
}
