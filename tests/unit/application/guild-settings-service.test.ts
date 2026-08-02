import { describe, expect, it, vi } from "vitest";

import type { GuildSettingsRepository } from "../../../src/application/settings/guild-settings-repository.js";
import { GuildSettingsService } from "../../../src/application/settings/guild-settings-service.js";
import type { GuildSettings } from "../../../src/domain/settings/guild-settings.js";

const current: GuildSettings = {
  announcementsEnabled: true,
  defaultVolume: 80,
  guildId: "guild-1",
  idleTimeoutSeconds: 300,
  voiceCommandsEnabled: true,
  voiceLanguage: "pt",
  voiceSoundsEnabled: true,
};

function makeService(): {
  service: GuildSettingsService;
  repository: GuildSettingsRepository;
} {
  const repository: GuildSettingsRepository = {
    get: vi.fn().mockResolvedValue(current),
    update: vi
      .fn()
      .mockImplementation((_guildId, update) => Promise.resolve({ ...current, ...update })),
  };
  return { repository, service: new GuildSettingsService(repository) };
}

describe("GuildSettingsService voice language", () => {
  it("persists a valid voice language", async () => {
    const { service, repository } = makeService();
    const result = await service.update("guild-1", { voiceLanguage: "en" });
    expect(repository.update).toHaveBeenCalledWith("guild-1", { voiceLanguage: "en" });
    expect(result.voiceLanguage).toBe("en");
  });

  it("rejects an unsupported voice language without touching the repository", () => {
    const { service, repository } = makeService();
    // update() validates synchronously, so the invalid value throws before any Promise.
    expect(() => service.update("guild-1", { voiceLanguage: "fr" as "pt" })).toThrowError(
      expect.objectContaining({ code: "INVALID_VOICE_LANGUAGE" }),
    );
    expect(repository.update).not.toHaveBeenCalled();
  });
});

describe("GuildSettingsService voice toggles", () => {
  it("persists the voice-commands and voice-sounds toggles independently", async () => {
    const { service, repository } = makeService();
    await service.update("guild-1", { voiceCommandsEnabled: false });
    expect(repository.update).toHaveBeenCalledWith("guild-1", { voiceCommandsEnabled: false });

    await service.update("guild-1", { voiceSoundsEnabled: false });
    expect(repository.update).toHaveBeenCalledWith("guild-1", { voiceSoundsEnabled: false });
  });
});
