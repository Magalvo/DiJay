import { describe, expect, it, vi } from "vitest";

import { MusicError } from "../../../src/domain/music/music-error.js";
import type {
  EnqueueResult,
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

function createGateway(result?: Partial<EnqueueResult>): MusicGateway {
  return {
    clear: vi.fn().mockResolvedValue(0),
    enqueue: vi.fn().mockResolvedValue({
      added: [],
      playlistName: null,
      queueSize: 0,
      startedPlaying: false,
      ...result,
    }),
    getState: vi.fn().mockResolvedValue(null),
    pause: vi.fn().mockResolvedValue(false),
    remove: vi.fn().mockResolvedValue(null),
    resolve: vi.fn().mockResolvedValue([]),
    resolveSelection: vi.fn().mockResolvedValue({ playlistName: null, tracks: [] }),
    resume: vi.fn().mockResolvedValue(false),
    seek: vi.fn().mockResolvedValue(false),
    enqueueSystem: vi.fn().mockResolvedValue({
      enqueued: false,
      textChannelId: null,
      voiceChannelId: null,
    }),
    setLoop: vi.fn().mockResolvedValue(false),
    setVolume: vi.fn().mockResolvedValue(false),
    shuffle: vi.fn().mockResolvedValue(0),
    skip: vi.fn().mockResolvedValue(null),
    stop: vi.fn().mockResolvedValue(false),
  };
}

describe("MusicService", () => {
  it("trims the query and delegates playback context to the gateway", async () => {
    const gateway = createGateway({
      added: [
        {
          author: "Daft Punk",
          durationMs: 224_000,
          isStream: false,
          title: "Harder Better Faster Stronger",
          uri: "https://example.test/track",
        },
      ],
      queueSize: 1,
      startedPlaying: true,
    });
    const service = new MusicService(gateway);

    const result = await service.play({
      ...request,
      position: "queue",
      query: "  harder better  ",
    });

    expect(gateway.enqueue).toHaveBeenCalledWith({
      ...request,
      position: "queue",
      query: "harder better",
    });
    expect(result.added).toHaveLength(1);
  });

  it("rejects an empty query without calling infrastructure", async () => {
    const gateway = createGateway();
    const service = new MusicService(gateway);

    await expect(
      service.play({ ...request, position: "queue", query: "   " }),
    ).rejects.toMatchObject({
      code: "INVALID_QUERY",
    });
    expect(gateway.enqueue).not.toHaveBeenCalled();
  });

  it("turns an empty resolution into a stable domain error", async () => {
    const service = new MusicService(createGateway());

    await expect(
      service.play({ ...request, position: "queue", query: "missing song" }),
    ).rejects.toEqual(new MusicError("TRACK_NOT_FOUND", "No tracks matched the query."));
  });

  it("reports when skip is requested without active playback", async () => {
    const service = new MusicService(createGateway());

    await expect(service.skip(request)).rejects.toMatchObject({
      code: "NOTHING_PLAYING",
    });
  });

  it("delegates a system audio action without requiring a user playback context", async () => {
    const gateway = createGateway();
    const service = new MusicService(gateway);

    await service.playSystemAudioAction({
      guildId: "guild-1",
      position: "next",
      query: " http://bot:3000/audio-actions/greeting.mp3 ",
      requesterId: "audio-action:voice_join_greeting",
      targetVoiceChannelId: "voice-1",
    });

    expect(gateway.enqueueSystem).toHaveBeenCalledWith({
      guildId: "guild-1",
      position: "next",
      query: "http://bot:3000/audio-actions/greeting.mp3",
      requesterId: "audio-action:voice_join_greeting",
      targetVoiceChannelId: "voice-1",
    });
  });
});
