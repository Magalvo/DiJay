import { describe, expect, it, vi } from "vitest";

import { VoiceGreetingPlayer } from "../../../src/voice-listener/voice-greeting-player.js";

describe("VoiceGreetingPlayer", () => {
  it("plays the configured greeting on a ready voice connection", async () => {
    const play = vi.fn();
    const player = new VoiceGreetingPlayer({
      cooldownSeconds: 60,
      createAudioResource: vi.fn((file: string) => ({ file })),
      createPlayer: vi.fn(() => ({ play })),
      file: "/app/audio-actions/greeting.mp3",
      now: () => 1_000,
      subscribe: vi.fn(),
    });
    const connection = {};

    const played = await player.play(connection, "voice-1");

    expect(played).toBe(true);
    expect(play).toHaveBeenCalledWith({ file: "/app/audio-actions/greeting.mp3" });
  });

  it("skips repeated greetings inside the channel cooldown", async () => {
    let now = 1_000;
    const play = vi.fn();
    const player = new VoiceGreetingPlayer({
      cooldownSeconds: 60,
      createAudioResource: vi.fn((file: string) => ({ file })),
      createPlayer: vi.fn(() => ({ play })),
      file: "/app/audio-actions/greeting.mp3",
      now: () => now,
      subscribe: vi.fn(),
    });
    const connection = {};

    expect(await player.play(connection, "voice-1")).toBe(true);
    now += 30_000;
    expect(await player.play(connection, "voice-1")).toBe(false);
    now += 31_000;
    expect(await player.play(connection, "voice-1")).toBe(true);
    expect(play).toHaveBeenCalledTimes(2);
  });

  it("does nothing when no greeting file is configured", async () => {
    const play = vi.fn();
    const player = new VoiceGreetingPlayer({
      cooldownSeconds: 60,
      createAudioResource: vi.fn(),
      createPlayer: vi.fn(() => ({ play })),
      file: "",
      subscribe: vi.fn(),
    });

    await expect(player.play({}, "voice-1")).resolves.toBe(false);
    expect(play).not.toHaveBeenCalled();
  });
});
