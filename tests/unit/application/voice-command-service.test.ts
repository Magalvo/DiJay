import { describe, expect, it, vi } from "vitest";

import type { MusicService } from "../../../src/application/music/music-service.js";
import type { PlaybackRequest } from "../../../src/application/music/music-gateway.js";
import { VoiceCommandService } from "../../../src/application/voice/voice-command-service.js";

const request: PlaybackRequest = {
  guildId: "guild-1",
  requesterId: "user-1",
  textChannelId: "text-1",
  voiceChannelId: "voice-1",
};

function musicMock() {
  return {
    pause: vi.fn().mockResolvedValue(undefined),
    play: vi.fn().mockResolvedValue({ added: [{ title: "One More Time" }] }),
    setVolume: vi.fn().mockResolvedValue(undefined),
    shuffle: vi.fn().mockResolvedValue(4),
    skip: vi.fn().mockResolvedValue({ title: "Track" }),
    stop: vi.fn().mockResolvedValue(undefined),
  } as unknown as MusicService & Record<string, ReturnType<typeof vi.fn>>;
}

describe("VoiceCommandService", () => {
  it("dispatches a recognized control to the music service", async () => {
    const music = musicMock();
    const service = new VoiceCommandService(music);

    const result = await service.handle("DiJay salta", request);

    expect(music.skip).toHaveBeenCalledWith(request);
    expect(result).toMatchObject({ handled: true, intent: "skip" });
  });

  it("passes the spoken query to play", async () => {
    const music = musicMock();
    const service = new VoiceCommandService(music);

    const result = await service.handle("toca daft punk", request);

    expect(music.play).toHaveBeenCalledWith({
      ...request,
      position: "queue",
      query: "daft punk",
    });
    expect(result.message).toContain("One More Time");
  });

  it("applies a spoken volume level", async () => {
    const music = musicMock();
    const service = new VoiceCommandService(music);

    await service.handle("volume 40", request);

    expect(music.setVolume).toHaveBeenCalledWith({ ...request, volume: 40 });
  });

  it("dispatches English commands when constructed with the en language", async () => {
    const music = musicMock();
    const service = new VoiceCommandService(music, "en");

    const play = await service.handle("play daft punk", request);
    const skip = await service.handle("skip", request);

    expect(music.play).toHaveBeenCalledWith({ ...request, position: "queue", query: "daft punk" });
    expect(play.intent).toBe("play");
    expect(music.skip).toHaveBeenCalledWith(request);
    expect(skip.intent).toBe("skip");
  });

  it("ignores speech it does not understand", async () => {
    const music = musicMock();
    const service = new VoiceCommandService(music);

    const result = await service.handle("olá tudo bem", request);

    expect(result).toMatchObject({ handled: false, intent: "unknown" });
    expect(music.pause).not.toHaveBeenCalled();
    expect(music.play).not.toHaveBeenCalled();
  });
});
