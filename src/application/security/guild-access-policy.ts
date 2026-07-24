import { MusicError } from "../../domain/music/music-error.js";

export class GuildAccessPolicy {
  public constructor(private readonly allowedGuildId: string) {}

  public assertAllowed(guildId: string | null): asserts guildId is string {
    if (!this.isAllowed(guildId)) {
      throw new MusicError(
        "UNAUTHORIZED_GUILD",
        "This private bot is not available in this server.",
      );
    }
  }

  public isAllowed(guildId: string | null): boolean {
    return guildId === this.allowedGuildId;
  }
}
