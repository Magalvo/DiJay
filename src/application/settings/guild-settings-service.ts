import { MusicError } from "../../domain/music/music-error.js";
import type { GuildSettings, GuildSettingsUpdate } from "../../domain/settings/guild-settings.js";
import type { GuildSettingsRepository } from "./guild-settings-repository.js";

export class GuildSettingsService {
  public constructor(private readonly repository: GuildSettingsRepository) {}

  public get(guildId: string): Promise<GuildSettings> {
    return this.repository.get(guildId);
  }

  public update(guildId: string, update: GuildSettingsUpdate): Promise<GuildSettings> {
    if (
      update.defaultVolume !== undefined &&
      (!Number.isInteger(update.defaultVolume) ||
        update.defaultVolume < 0 ||
        update.defaultVolume > 150)
    ) {
      throw new MusicError("INVALID_VOLUME", "Default volume must be between 0 and 150.");
    }
    if (
      update.idleTimeoutSeconds !== undefined &&
      (!Number.isInteger(update.idleTimeoutSeconds) ||
        update.idleTimeoutSeconds < 30 ||
        update.idleTimeoutSeconds > 3_600)
    ) {
      throw new MusicError(
        "INVALID_IDLE_TIMEOUT",
        "Idle timeout must be between 30 and 3600 seconds.",
      );
    }
    return this.repository.update(guildId, update);
  }
}
