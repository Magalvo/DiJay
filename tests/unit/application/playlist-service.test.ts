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

  it("skips a transiently failing track and keeps loading the rest", async () => {
    const playlist = buildPlaylist(["one", "two", "three"]);
    const repository = {
      getByName: vi.fn().mockResolvedValue(playlist),
    } as unknown as PlaylistRepository;
    const play = vi
      .fn()
      .mockResolvedValueOnce(enqueued(playlist.tracks[0]!.track))
      .mockRejectedValueOnce(new Error("Lavalink node disconnected"))
      .mockResolvedValueOnce(enqueued(playlist.tracks[2]!.track));
    const music = { play } as unknown as MusicService;
    const service = new PlaylistService(repository, music);

    const result = await service.play(request(), "Mix");

    expect(result).toEqual({ added: 2, failed: 1 });
    expect(play).toHaveBeenCalledTimes(3);
  });

  it("aborts the whole load when the caller is not in the bot's voice channel", async () => {
    const playlist = buildPlaylist(["one", "two"]);
    const repository = {
      getByName: vi.fn().mockResolvedValue(playlist),
    } as unknown as PlaylistRepository;
    const play = vi
      .fn()
      .mockRejectedValueOnce(new MusicError("NOT_IN_SAME_VOICE_CHANNEL", "Wrong channel"));
    const music = { play } as unknown as MusicService;
    const service = new PlaylistService(repository, music);

    await expect(service.play(request(), "Mix")).rejects.toBeInstanceOf(MusicError);
    expect(play).toHaveBeenCalledTimes(1);
  });
});

function buildPlaylist(titles: readonly string[]) {
  return {
    createdBy: "user-1",
    guildId: "guild-1",
    name: "Mix",
    tracks: titles.map((title, index) => ({
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
}

function enqueued(track: unknown) {
  return { added: [track], playlistName: null, queueSize: 1, startedPlaying: true };
}

function request() {
  return {
    guildId: "guild-1",
    requesterId: "user-1",
    textChannelId: "text-1",
    voiceChannelId: "voice-1",
  };
}
