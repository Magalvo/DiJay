import type { DatabaseSync } from "node:sqlite";

import type { GuildSettingsRepository } from "../../application/settings/guild-settings-repository.js";
import type { GuildSettings, GuildSettingsUpdate } from "../../domain/settings/guild-settings.js";

interface SettingsDefaults {
  readonly defaultVolume: number;
  readonly idleTimeoutSeconds: number;
}

interface SettingsRow {
  announcements_enabled: number;
  default_volume: number;
  guild_id: string;
  idle_timeout_seconds: number;
  voice_commands_enabled: number;
  voice_join_greeting_enabled: number;
  voice_language: string;
  voice_sounds_enabled: number;
}

export class SqliteGuildSettingsRepository implements GuildSettingsRepository {
  public constructor(
    private readonly database: DatabaseSync,
    private readonly defaults: SettingsDefaults,
  ) {}

  public get(guildId: string): Promise<GuildSettings> {
    this.ensure(guildId);
    const row = this.database
      .prepare(
        `SELECT guild_id, default_volume, idle_timeout_seconds, announcements_enabled,
                voice_language, voice_commands_enabled, voice_sounds_enabled,
                voice_join_greeting_enabled
         FROM guild_settings WHERE guild_id = ?`,
      )
      .get(guildId) as unknown as SettingsRow;
    return Promise.resolve(this.map(row));
  }

  public async update(guildId: string, update: GuildSettingsUpdate): Promise<GuildSettings> {
    const current = await this.get(guildId);
    this.database
      .prepare(
        `UPDATE guild_settings
         SET default_volume = ?, idle_timeout_seconds = ?, announcements_enabled = ?,
             voice_language = ?, voice_commands_enabled = ?, voice_sounds_enabled = ?,
             voice_join_greeting_enabled = ?, updated_at = ?
         WHERE guild_id = ?`,
      )
      .run(
        update.defaultVolume ?? current.defaultVolume,
        update.idleTimeoutSeconds ?? current.idleTimeoutSeconds,
        (update.announcementsEnabled ?? current.announcementsEnabled) ? 1 : 0,
        update.voiceLanguage ?? current.voiceLanguage,
        (update.voiceCommandsEnabled ?? current.voiceCommandsEnabled) ? 1 : 0,
        (update.voiceSoundsEnabled ?? current.voiceSoundsEnabled) ? 1 : 0,
        (update.voiceJoinGreetingEnabled ?? current.voiceJoinGreetingEnabled) ? 1 : 0,
        new Date().toISOString(),
        guildId,
      );
    return this.get(guildId);
  }

  private ensure(guildId: string): void {
    this.database
      .prepare(
        `INSERT INTO guild_settings(
           guild_id, default_volume, idle_timeout_seconds, announcements_enabled, updated_at
         ) VALUES (?, ?, ?, 1, ?)
         ON CONFLICT(guild_id) DO NOTHING`,
      )
      .run(
        guildId,
        this.defaults.defaultVolume,
        this.defaults.idleTimeoutSeconds,
        new Date().toISOString(),
      );
  }

  private map(row: SettingsRow): GuildSettings {
    return {
      announcementsEnabled: row.announcements_enabled === 1,
      defaultVolume: row.default_volume,
      guildId: row.guild_id,
      idleTimeoutSeconds: row.idle_timeout_seconds,
      voiceCommandsEnabled: row.voice_commands_enabled === 1,
      voiceJoinGreetingEnabled: row.voice_join_greeting_enabled === 1,
      voiceLanguage: row.voice_language === "en" ? "en" : "pt",
      voiceSoundsEnabled: row.voice_sounds_enabled === 1,
    };
  }
}
