import { describe, expect, it } from "vitest";

import type { PlaybackStateSnapshot } from "../../../src/domain/music/track.js";
import {
  buildControlPanel,
  musicButtonIds,
} from "../../../src/presentation/discord/control-panel.js";

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
  positionMs: 60_000,
  upcoming: [],
  voiceChannelId: "voice-1",
  volume: 80,
};

describe("control panel", () => {
  it("uses stable component IDs and current playback metadata", () => {
    const panel = buildControlPanel(state);
    const json = panel.components?.flatMap((row) => row.toJSON().components);
    const embed = panel.embeds?.[0]?.toJSON();

    expect(embed?.title).toBe("Track");
    expect(embed?.fields?.find(({ name }) => name === "Volume")).toEqual({
      inline: true,
      name: "Volume",
      value: "80%",
    });
    const customIds = json
      ?.filter((component) => "custom_id" in component)
      .map((component) => component.custom_id);
    expect(customIds).toEqual(expect.arrayContaining(Object.values(musicButtonIds)));
  });

  it("disables playback actions for stale panels without a player", () => {
    const panel = buildControlPanel(null);
    const components = panel.components?.[0]?.toJSON().components;

    expect(
      components?.every((component) => "disabled" in component && component.disabled === true),
    ).toBe(true);
  });
});
