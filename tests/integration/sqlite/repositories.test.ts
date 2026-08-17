import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { openAppDatabase } from "../../../src/infrastructure/sqlite/database.js";
import { SqliteGuildSettingsRepository } from "../../../src/infrastructure/sqlite/sqlite-guild-settings-repository.js";
import { SqlitePlaylistRepository } from "../../../src/infrastructure/sqlite/sqlite-playlist-repository.js";

describe("SQLite repositories", () => {
  let directory: string;
  let database: ReturnType<typeof openAppDatabase>;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "dijay-"));
    database = openAppDatabase(join(directory, "dijay.sqlite"));
  });

  afterEach(() => {
    database.close();
    rmSync(directory, { force: true, recursive: true });
  });

  it("persists guild defaults and updates", async () => {
    const repository = new SqliteGuildSettingsRepository(database, {
      defaultVolume: 80,
      idleTimeoutSeconds: 300,
    });

    expect(await repository.get("guild-1")).toMatchObject({
      announcementsEnabled: true,
      defaultVolume: 80,
      guildId: "guild-1",
      idleTimeoutSeconds: 300,
      voiceCommandsEnabled: true,
      voiceJoinGreetingEnabled: true,
      voiceLanguage: "pt",
      voiceSoundsEnabled: true,
    });

    await repository.update("guild-1", {
      announcementsEnabled: false,
      defaultVolume: 65,
      voiceCommandsEnabled: false,
      voiceJoinGreetingEnabled: false,
      voiceLanguage: "en",
      voiceSoundsEnabled: false,
    });

    expect(await repository.get("guild-1")).toMatchObject({
      announcementsEnabled: false,
      defaultVolume: 65,
      voiceCommandsEnabled: false,
      voiceJoinGreetingEnabled: false,
      voiceLanguage: "en",
      voiceSoundsEnabled: false,
    });

    // Independent: updating one voice toggle must not disturb the others.
    await repository.update("guild-1", { voiceCommandsEnabled: true });
    expect(await repository.get("guild-1")).toMatchObject({
      voiceCommandsEnabled: true,
      voiceJoinGreetingEnabled: false,
      voiceSoundsEnabled: false,
    });
  });

  it("keeps playlist names case-insensitively unique and reindexes tracks", async () => {
    const repository = new SqlitePlaylistRepository(database);
    await repository.create("guild-1", "Chill", "user-1");

    await expect(repository.create("guild-1", " chill ", "user-2")).rejects.toMatchObject({
      code: "PLAYLIST_EXISTS",
    });

    for (const title of ["One", "Two", "Three"]) {
      await repository.addTrack("guild-1", "CHILL", {
        author: "Artist",
        durationMs: 180_000,
        isStream: false,
        title,
        uri: `https://example.test/${title}`,
      });
    }

    await repository.removeTrack("guild-1", "chill", 2);
    const playlist = await repository.getByName("guild-1", "Chill");

    expect(playlist?.tracks.map(({ position, track }) => [position, track.title])).toEqual([
      [1, "One"],
      [2, "Three"],
    ]);
  });

  it("imports many tracks at once and reports the overflow past the 100 limit", async () => {
    const repository = new SqlitePlaylistRepository(database);
    await repository.create("guild-1", "Import", "user-1");
    const tracks = Array.from({ length: 102 }, (_, index) => ({
      author: "Artist",
      durationMs: 180_000,
      isStream: false,
      title: `Track ${index + 1}`,
      uri: `https://example.test/${index + 1}`,
    }));

    const result = await repository.addTracks("guild-1", "Import", tracks);

    expect(result.added).toHaveLength(100);
    expect(result.skipped).toBe(2);
    expect(result.added[0]).toMatchObject({ position: 1 });
    expect(result.added[99]).toMatchObject({ position: 100 });

    const playlist = await repository.getByName("guild-1", "Import");
    expect(playlist?.tracks).toHaveLength(100);
  });

  it("appends imported tracks after existing ones", async () => {
    const repository = new SqlitePlaylistRepository(database);
    await repository.create("guild-1", "Mix", "user-1");
    await repository.addTrack("guild-1", "Mix", {
      author: "Artist",
      durationMs: 1_000,
      isStream: false,
      title: "Existing",
      uri: "https://example.test/existing",
    });

    const newTrack = { author: "A", durationMs: 1_000, isStream: false, title: "New", uri: null };
    const result = await repository.addTracks("guild-1", "Mix", [newTrack]);

    expect(result).toEqual({ added: [{ position: 2, track: newTrack }], skipped: 0 });
  });

  it("enforces the 100-track playlist limit", async () => {
    const repository = new SqlitePlaylistRepository(database);
    await repository.create("guild-1", "Maximum", "user-1");
    const track = {
      author: "Artist",
      durationMs: 180_000,
      isStream: false,
      title: "Track",
      uri: "https://example.test/track",
    };

    for (let index = 0; index < 100; index += 1) {
      await repository.addTrack("guild-1", "Maximum", {
        ...track,
        title: `Track ${index + 1}`,
      });
    }

    await expect(repository.addTrack("guild-1", "Maximum", track)).rejects.toMatchObject({
      code: "PLAYLIST_FULL",
    });
  });
});
