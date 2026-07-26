import type { Poru } from "poru";
import { describe, expect, it, vi } from "vitest";

import type { PlaybackRequest } from "../../../src/application/music/music-gateway.js";
import { PoruMusicGateway } from "../../../src/infrastructure/lavalink/poru-music-gateway.js";

const request: PlaybackRequest = {
  guildId: "guild-1",
  requesterId: "user-1",
  textChannelId: "text-1",
  voiceChannelId: "voice-1",
};

function poruTrack(title: string) {
  return {
    info: {
      author: "Artist",
      isStream: false,
      length: 180_000,
      requester: "user-1",
      title,
      uri: `https://example.test/${title}`,
    },
  };
}

describe("PoruMusicGateway", () => {
  it("queues the first search result and starts an idle player", async () => {
    const player = {
      currentTrack: null,
      isPaused: false,
      isPlaying: false,
      play: vi.fn().mockResolvedValue(undefined),
      queue: {
        add: vi.fn(),
        size: 1,
      },
      setTextChannel: vi.fn(),
      voiceChannel: "voice-1",
    };
    const poru = {
      createConnection: vi.fn().mockReturnValue(player),
      get: vi.fn().mockReturnValue(null),
      resolve: vi.fn().mockResolvedValue({
        loadType: "search",
        playlistInfo: {},
        tracks: [poruTrack("First"), poruTrack("Second")],
      }),
    } as unknown as Poru;
    const gateway = new PoruMusicGateway(poru);

    const result = await gateway.enqueue({ ...request, position: "queue", query: "song" });

    expect(player.queue.add).toHaveBeenCalledTimes(1);
    expect(player.play).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      added: [{ title: "First" }],
      playlistName: null,
      startedPlaying: true,
    });
  });

  it("selects every track of a resolved playlist for import", async () => {
    const poru = {
      resolve: vi.fn().mockResolvedValue({
        loadType: "playlist",
        playlistInfo: { name: "Spotify Mix", type: "playlist" },
        tracks: [poruTrack("One"), poruTrack("Two"), poruTrack("Three")],
      }),
    } as unknown as Poru;
    const gateway = new PoruMusicGateway(poru);

    const selection = await gateway.resolveSelection(
      "https://open.spotify.com/playlist/x",
      "user-1",
    );

    expect(selection.tracks.map((track) => track.title)).toEqual(["One", "Two", "Three"]);
    expect(selection.playlistName).toBe("Spotify Mix");
  });

  it("selects only the top result for a plain search or single track", async () => {
    const poru = {
      resolve: vi.fn().mockResolvedValue({
        loadType: "search",
        playlistInfo: {},
        tracks: [poruTrack("Best"), poruTrack("Other")],
      }),
    } as unknown as Poru;
    const gateway = new PoruMusicGateway(poru);

    const selection = await gateway.resolveSelection("daft punk", "user-1");

    expect(selection.tracks.map((track) => track.title)).toEqual(["Best"]);
    expect(selection.playlistName).toBeNull();
  });

  it("returns an empty selection when nothing loads", async () => {
    const poru = {
      resolve: vi.fn().mockResolvedValue({ loadType: "empty", playlistInfo: {}, tracks: [] }),
    } as unknown as Poru;
    const gateway = new PoruMusicGateway(poru);

    const selection = await gateway.resolveSelection("https://open.spotify.com/track/x", "user-1");

    expect(selection.tracks).toEqual([]);
    expect(selection.playlistName).toBeNull();
  });

  it("blocks controls from a different voice channel", async () => {
    const poru = {
      get: vi.fn().mockReturnValue({
        currentTrack: poruTrack("Current"),
        voiceChannel: "voice-2",
      }),
    } as unknown as Poru;
    const gateway = new PoruMusicGateway(poru);

    await expect(gateway.pause(request)).rejects.toMatchObject({
      code: "NOT_IN_SAME_VOICE_CHANNEL",
    });
  });

  it("places a requested track next without replacing the current track", async () => {
    const queue = [poruTrack("Existing")];
    Object.assign(queue, {
      add: vi.fn(),
    });
    Object.defineProperty(queue, "size", { get: () => queue.length });
    const player = {
      currentTrack: poruTrack("Current"),
      isPaused: false,
      isPlaying: true,
      queue,
      setTextChannel: vi.fn(),
      voiceChannel: "voice-1",
    };
    const poru = {
      get: vi.fn().mockReturnValue(player),
      resolve: vi.fn().mockResolvedValue({
        loadType: "track",
        playlistInfo: {},
        tracks: [poruTrack("Next")],
      }),
    } as unknown as Poru;
    const gateway = new PoruMusicGateway(poru);

    await gateway.enqueue({ ...request, position: "next", query: "next song" });

    expect(queue.map((track) => track.info.title)).toEqual(["Next", "Existing"]);
  });

  it("places a requested track first and skips the current track for play-now", async () => {
    const queue = [poruTrack("Existing")];
    Object.assign(queue, { add: vi.fn() });
    Object.defineProperty(queue, "size", { get: () => queue.length });
    const skip = vi.fn().mockResolvedValue(undefined);
    const player = {
      currentTrack: poruTrack("Current"),
      isPaused: false,
      isPlaying: true,
      queue,
      setTextChannel: vi.fn(),
      skip,
      voiceChannel: "voice-1",
    };
    const poru = {
      get: vi.fn().mockReturnValue(player),
      resolve: vi.fn().mockResolvedValue({
        loadType: "track",
        playlistInfo: {},
        tracks: [poruTrack("Now")],
      }),
    } as unknown as Poru;
    const gateway = new PoruMusicGateway(poru);

    await gateway.enqueue({ ...request, position: "now", query: "now song" });

    expect(queue.map((track) => track.info.title)).toEqual(["Now", "Existing"]);
    expect(skip).toHaveBeenCalledOnce();
  });

  it("enqueues system audio on an existing player without creating a new connection", async () => {
    const queue = [poruTrack("Existing")];
    Object.assign(queue, { add: vi.fn() });
    Object.defineProperty(queue, "size", { get: () => queue.length });
    const player = {
      currentTrack: poruTrack("Current"),
      isPaused: false,
      isPlaying: true,
      queue,
      textChannel: "text-1",
      voiceChannel: "voice-1",
    };
    const poru = {
      createConnection: vi.fn(),
      get: vi.fn().mockReturnValue(player),
      resolve: vi.fn().mockResolvedValue({
        loadType: "track",
        playlistInfo: {},
        tracks: [poruTrack("Greeting")],
      }),
    } as unknown as Poru;
    const gateway = new PoruMusicGateway(poru);

    const result = await gateway.enqueueSystem({
      guildId: "guild-1",
      position: "next",
      query: "http://bot:3000/audio-actions/greeting.mp3",
      requesterId: "audio-action:voice_join_greeting",
      targetVoiceChannelId: "voice-1",
    });

    expect(poru.createConnection).not.toHaveBeenCalled();
    expect(queue.map((track) => track.info.title)).toEqual(["Greeting", "Existing"]);
    expect(result).toEqual({
      enqueued: true,
      textChannelId: "text-1",
      voiceChannelId: "voice-1",
    });
  });

  it("does not enqueue system audio when the active player is in another voice channel", async () => {
    const poru = {
      get: vi.fn().mockReturnValue({
        currentTrack: poruTrack("Current"),
        queue: [],
        textChannel: "text-1",
        voiceChannel: "voice-2",
      }),
      resolve: vi.fn(),
    } as unknown as Poru;
    const gateway = new PoruMusicGateway(poru);

    const result = await gateway.enqueueSystem({
      guildId: "guild-1",
      position: "next",
      query: "http://bot:3000/audio-actions/greeting.mp3",
      requesterId: "audio-action:voice_join_greeting",
      targetVoiceChannelId: "voice-1",
    });

    expect(poru.resolve).not.toHaveBeenCalled();
    expect(result.enqueued).toBe(false);
  });
});
