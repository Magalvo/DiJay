import { describe, expect, it, vi } from "vitest";

import type {
  MusicGateway,
  PlaybackRequest,
} from "../../../src/application/music/music-gateway.js";
import { MusicService } from "../../../src/application/music/music-service.js";

const request: PlaybackRequest = {
  guildId: "guild-1",
  requesterId: "user-1",
  textChannelId: "text-1",
  voiceChannelId: "voice-1",
};

function gateway(overrides: Record<string, unknown> = {}): MusicGateway {
  const base: MusicGateway = {
    clear: vi.fn().mockResolvedValue(0),
    enqueue: vi.fn(),
    getState: vi.fn().mockResolvedValue(null),
    pause: vi.fn(),
    remove: vi.fn().mockResolvedValue(null),
    resolve: vi.fn(),
    resolveSelection: vi.fn().mockResolvedValue({ playlistName: null, tracks: [] }),
    resume: vi.fn(),
    seek: vi.fn().mockResolvedValue(false),
    setLoop: vi.fn().mockResolvedValue(false),
    setVolume: vi.fn().mockResolvedValue(false),
    shuffle: vi.fn().mockResolvedValue(0),
    skip: vi.fn(),
    stop: vi.fn(),
  };
  return Object.assign(base, overrides);
}

describe("advanced MusicService controls", () => {
  it("validates the public volume range", async () => {
    const service = new MusicService(gateway());

    await expect(service.setVolume({ ...request, volume: 151 })).rejects.toMatchObject({
      code: "INVALID_VOLUME",
    });
  });

  it("rejects seek on a live stream before touching the gateway", async () => {
    const seek = vi.fn();
    const service = new MusicService(
      gateway({
        getState: vi.fn().mockResolvedValue({
          current: {
            author: "Radio",
            durationMs: 0,
            isStream: true,
            title: "Live",
            uri: "https://example.test/live",
          },
          isPaused: false,
          loopMode: "off",
          positionMs: 0,
          upcoming: [],
          voiceChannelId: "voice-1",
          volume: 80,
        }),
        seek,
      }),
    );

    await expect(service.seek({ ...request, positionMs: 30_000 })).rejects.toMatchObject({
      code: "LIVE_STREAM_NOT_SEEKABLE",
    });
    expect(seek).not.toHaveBeenCalled();
  });

  it("uses 1-based positions when removing upcoming tracks", async () => {
    const remove = vi.fn().mockResolvedValue({
      author: "Artist",
      durationMs: 1000,
      isStream: false,
      title: "Removed",
      uri: "https://example.test/removed",
    });
    const service = new MusicService(gateway({ remove }));

    await service.remove({ ...request, position: 2 });

    expect(remove).toHaveBeenCalledWith({ ...request, position: 2 });
  });
});
