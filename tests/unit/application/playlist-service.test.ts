import { describe, expect, it, vi } from "vitest";

import type { MusicService } from "../../../src/application/music/music-service.js";
import type { PlaylistRepository } from "../../../src/application/playlists/playlist-repository.js";
import { PlaylistService } from "../../../src/application/playlists/playlist-service.js";
import { MusicError } from "../../../src/domain/music/music-error.js";

describe("PlaylistService", () => {
  it("reports unavailable tracks while queueing the remaining playlist", async () => {
    const playlist = {
      createdBy: "user-1",
      guildId: "guild-1",
      name: "Mix",
      tracks: ["one", "two"].map((title, index) => ({
        position: index + 1,
        track: {
          author: "Artist",
          durationMs: 180_000,
          isStream: false,
          title,
          uri: `https://example.test/${title}`,
        },
      })),
    };
    const repository = {
      getByName: vi.fn().mockResolvedValue(playlist),
    } as unknown as PlaylistRepository;
    const play = vi
      .fn()
      .mockResolvedValueOnce({
        added: [playlist.tracks[0]!.track],
        playlistName: null,
        queueSize: 1,
        startedPlaying: true,
      })
      .mockRejectedValueOnce(new MusicError("TRACK_NOT_FOUND", "Unavailable"));
    const music = { play } as unknown as MusicService;
    const service = new PlaylistService(repository, music);

    const result = await service.play(
      {
        guildId: "guild-1",
        requesterId: "user-1",
        textChannelId: "text-1",
        voiceChannelId: "voice-1",
      },
      "Mix",
    );

    expect(result).toEqual({ added: 1, failed: 1 });
    expect(play).toHaveBeenCalledTimes(2);
  });

  it("imports every track of a resolved playlist selection when adding", async () => {
    const selectionTracks = ["a", "b", "c"].map((title) => ({
      author: "Artist",
      durationMs: 1_000,
      isStream: false,
      title,
      uri: `https://example.test/${title}`,
    }));
    const addTracks = vi.fn().mockResolvedValue({
      added: selectionTracks.map((track, index) => ({ position: index + 1, track })),
      skipped: 0,
    });
    const repository = {
      getByName: vi.fn().mockResolvedValue({ name: "Mix", tracks: [] }),
      addTracks,
    } as unknown as PlaylistRepository;
    const resolveSelection = vi
      .fn()
      .mockResolvedValue({ tracks: selectionTracks, playlistName: "Spotify Mix" });
    const music = { resolveSelection } as unknown as MusicService;
    const service = new PlaylistService(repository, music);

    const result = await service.add(
      "guild-1",
      "Mix",
      "https://open.spotify.com/playlist/x",
      "user-1",
    );

    expect(resolveSelection).toHaveBeenCalledWith("https://open.spotify.com/playlist/x", "user-1");
    expect(addTracks).toHaveBeenCalledWith("guild-1", "Mix", selectionTracks);
    expect(result).toEqual({
      added: selectionTracks.map((track, index) => ({ position: index + 1, track })),
      skipped: 0,
    });
  });

  it("rejects adding when nothing resolves", async () => {
    const repository = {
      getByName: vi.fn().mockResolvedValue({ name: "Mix", tracks: [] }),
      addTracks: vi.fn(),
    } as unknown as PlaylistRepository;
    const music = {
      resolveSelection: vi.fn().mockResolvedValue({ tracks: [], playlistName: null }),
    } as unknown as MusicService;
    const service = new PlaylistService(repository, music);

    await expect(service.add("guild-1", "Mix", "nonsense", "user-1")).rejects.toMatchObject({
      code: "TRACK_NOT_FOUND",
    });
  });
});
