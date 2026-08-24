import { describe, expect, it, vi } from "vitest";

import type { PlaybackProbe } from "../../../src/application/diagnostics/playback-probe.js";
import {
  PlaybackSmokeCheck,
  type PlaybackSmokeCheckConfig,
} from "../../../src/application/diagnostics/playback-smoke-check.js";
import type { Track } from "../../../src/domain/music/track.js";

const track: Track = {
  author: "Artist",
  durationMs: 180_000,
  isStream: false,
  title: "Known Track",
  uri: "https://example.test/track",
};

const config: PlaybackSmokeCheckConfig = {
  guildId: "guild-1",
  query: "a stable track",
  settleMs: 3_000,
  timeoutMs: 15_000,
  voiceChannelId: "voice-1",
};

function probe(overrides: Partial<PlaybackProbe> = {}): PlaybackProbe {
  return {
    isGuildBusy: () => false,
    isNodeConnected: () => true,
    probeStream: vi.fn().mockResolvedValue({ error: null, positionMs: 2_800, started: true }),
    resolve: vi.fn().mockResolvedValue([track]),
    ...overrides,
  };
}

function check(
  overrides: Partial<PlaybackProbe> = {},
  configOverrides: Partial<PlaybackSmokeCheckConfig> = {},
): PlaybackSmokeCheck {
  let clock = 1_000;
  return new PlaybackSmokeCheck(probe(overrides), { ...config, ...configOverrides }, () => {
    clock += 50;
    return clock;
  });
}

describe("PlaybackSmokeCheck", () => {
  it("passes only after confirming the position advanced", async () => {
    const result = await check().run();

    expect(result.verdict).toBe("passed");
    expect(result.reachedStage).toBe("stream");
    expect(result.trackTitle).toBe("Known Track");
    expect(result.durationMs).toBeGreaterThan(0);
  });

  it("fails when the Lavalink node is not connected, without searching", async () => {
    const resolve = vi.fn().mockResolvedValue([track]);

    const result = await check({ isNodeConnected: () => false, resolve }).run();

    expect(result).toMatchObject({ verdict: "failed", reachedStage: "node" });
    expect(resolve).not.toHaveBeenCalled();
  });

  it("fails when the search returns nothing", async () => {
    const result = await check({ resolve: vi.fn().mockResolvedValue([]) }).run();

    expect(result).toMatchObject({ verdict: "failed", reachedStage: "resolve" });
    expect(result.detail).toContain("não devolveu faixas");
  });

  it("fails when the search itself throws", async () => {
    const result = await check({
      resolve: vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED")),
    }).run();

    expect(result).toMatchObject({ verdict: "failed", reachedStage: "resolve" });
    expect(result.detail).toContain("connect ECONNREFUSED");
  });

  describe("the failure mode this check exists for", () => {
    it("fails when the source rejects the track at stream time", async () => {
      const result = await check({
        probeStream: vi.fn().mockResolvedValue({
          error: "This video requires login",
          positionMs: 0,
          started: false,
        }),
      }).run();

      expect(result).toMatchObject({ verdict: "failed", reachedStage: "stream" });
      expect(result.detail).toContain("This video requires login");
    });

    it("fails when playback starts but no audio flows", async () => {
      const result = await check({
        probeStream: vi.fn().mockResolvedValue({ error: null, positionMs: 0, started: true }),
      }).run();

      expect(result).toMatchObject({ verdict: "failed", reachedStage: "stream" });
      expect(result.detail).toContain("silêncio");
    });

    it("fails when the track never starts within the timeout", async () => {
      const result = await check({
        probeStream: vi.fn().mockResolvedValue({ error: null, positionMs: 0, started: false }),
      }).run();

      expect(result).toMatchObject({ verdict: "failed", reachedStage: "stream" });
      expect(result.detail).toContain("nunca começou");
    });

    it("fails when the probe throws", async () => {
      const result = await check({
        probeStream: vi.fn().mockRejectedValue(new Error("voice connection timed out")),
      }).run();

      expect(result).toMatchObject({ verdict: "failed", reachedStage: "stream" });
      expect(result.detail).toContain("voice connection timed out");
    });
  });

  describe("never reports an unproven check as healthy", () => {
    it("skips, not passes, when no probe channel is configured", async () => {
      const probeStream = vi.fn();

      const result = await check({ probeStream }, { voiceChannelId: null }).run();

      expect(result.verdict).toBe("skipped");
      expect(result.verdict).not.toBe("passed");
      expect(result.reachedStage).toBe("resolve");
      expect(result.detail).toContain("não prova");
      expect(probeStream).not.toHaveBeenCalled();
    });

    it("skips rather than disturbing a guild that is currently listening", async () => {
      const probeStream = vi.fn();

      const result = await check({ isGuildBusy: () => true, probeStream }).run();

      expect(result.verdict).toBe("skipped");
      expect(result.reachedStage).toBe("resolve");
      expect(probeStream).not.toHaveBeenCalled();
    });
  });

  it("forwards the configured probe parameters", async () => {
    const probeStream = vi
      .fn()
      .mockResolvedValue({ error: null, positionMs: 1_000, started: true });

    await check({ probeStream }, { settleMs: 1_500, timeoutMs: 9_000 }).run();

    expect(probeStream).toHaveBeenCalledWith({
      guildId: "guild-1",
      query: "a stable track",
      settleMs: 1_500,
      timeoutMs: 9_000,
      voiceChannelId: "voice-1",
    });
  });
});
