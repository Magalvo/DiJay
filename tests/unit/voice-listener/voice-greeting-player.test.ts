import { describe, expect, it, vi } from "vitest";

import { VoiceClipPlayer } from "../../../src/voice-listener/voice-clip-player.js";

describe("VoiceClipPlayer", () => {
  it("plays a clip on a ready voice connection", async () => {
    const play = vi.fn();
    const player = new VoiceClipPlayer({
      createAudioResource: vi.fn((file: string) => ({ file })),
      createPlayer: vi.fn(() => ({ play })),
      now: () => 1_000,
      subscribe: vi.fn(),
    });
    const connection = {};

    const played = await player.play(connection, "cooldown-key", "/app/audio-actions/greeting.mp3", 60);

    expect(played).toBe(true);
    expect(play).toHaveBeenCalledWith({ file: "/app/audio-actions/greeting.mp3" });
  });

  it("skips repeated clips inside the cooldown", async () => {
    let now = 1_000;
    const play = vi.fn();
    const player = new VoiceClipPlayer({
      createAudioResource: vi.fn((file: string) => ({ file })),
      createPlayer: vi.fn(() => ({ play })),
      now: () => now,
      subscribe: vi.fn(),
    });
    const connection = {};

    expect(await player.play(connection, "cooldown-key", "/app/audio-actions/greeting.mp3", 60)).toBe(true);
    now += 30_000;
    expect(await player.play(connection, "cooldown-key", "/app/audio-actions/greeting.mp3", 60)).toBe(false);
    now += 31_000;
    expect(await player.play(connection, "cooldown-key", "/app/audio-actions/greeting.mp3", 60)).toBe(true);
    expect(play).toHaveBeenCalledTimes(2);
  });

  it("does nothing when no clip file is configured", async () => {
    const play = vi.fn();
    const player = new VoiceClipPlayer({
      createAudioResource: vi.fn(),
      createPlayer: vi.fn(() => ({ play })),
      subscribe: vi.fn(),
    });

    await expect(player.play({}, "cooldown-key", "", 60)).resolves.toBe(false);
    expect(play).not.toHaveBeenCalled();
  });
});
