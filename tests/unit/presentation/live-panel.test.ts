import type { Client, EmbedBuilder } from "discord.js";
import { describe, expect, it, vi } from "vitest";

import type { MusicService } from "../../../src/application/music/music-service.js";
import type { PlaybackStateSnapshot } from "../../../src/domain/music/track.js";
import { LivePanelManager } from "../../../src/presentation/discord/live-panel.js";

const state: PlaybackStateSnapshot = {
  current: {
    author: "Artist",
    durationMs: 180_000,
    isStream: false,
    requesterId: "user-1",
    title: "Track",
    uri: "https://example.test/track",
  },
  isPaused: false,
  loopMode: "off",
  positionMs: 0,
  upcoming: [],
  voiceChannelId: "voice-1",
  volume: 80,
};

function setup(state: PlaybackStateSnapshot | null) {
  const edit = vi.fn().mockResolvedValue(undefined);
  const channel = { isTextBased: () => true, messages: { edit } };
  const client = {
    channels: { fetch: vi.fn().mockResolvedValue(channel) },
  } as unknown as Client;
  const music = { getState: vi.fn().mockResolvedValue(state) } as unknown as MusicService;
  const logger = { error: vi.fn() };
  return { client, edit, logger, manager: new LivePanelManager(client, music, logger), music };
}

describe("LivePanelManager", () => {
  it("edits the registered panel message with the current playback state", async () => {
    const { edit, manager } = setup(state);
    manager.register("guild-1", "channel-1", "message-1");

    await manager.refresh("guild-1");

    expect(edit).toHaveBeenCalledTimes(1);
    const [messageId, payload] = edit.mock.calls[0] as [string, { embeds: EmbedBuilder[] }];
    expect(messageId).toBe("message-1");
    expect(payload.embeds[0]?.toJSON().title).toBe("Track");
  });

  it("does nothing when no panel is registered for the guild", async () => {
    const { edit, manager } = setup(state);

    await manager.refresh("guild-1");

    expect(edit).not.toHaveBeenCalled();
  });

  it("stops tracking a panel that can no longer be edited", async () => {
    const { edit, logger, manager } = setup(state);
    edit.mockRejectedValueOnce(new Error("Unknown Message"));
    manager.register("guild-1", "channel-1", "message-1");

    await manager.refresh("guild-1");
    await manager.refresh("guild-1");

    expect(edit).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledOnce();
  });

  it("clears a registration on request", async () => {
    const { edit, manager } = setup(state);
    manager.register("guild-1", "channel-1", "message-1");
    manager.clear("guild-1");

    await manager.refresh("guild-1");

    expect(edit).not.toHaveBeenCalled();
  });
});
