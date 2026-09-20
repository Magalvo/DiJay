import { describe, expect, it, vi } from "vitest";

import { PlaylistService } from "../../../src/application/playlists/playlist-service.js";
import type { PlaylistRepository } from "../../../src/application/playlists/playlist-repository.js";
import type { MusicService } from "../../../src/application/music/music-service.js";
import type { SpotifyCatalog } from "../../../src/application/spotify/spotify-catalog.js";
import { MusicError } from "../../../src/domain/music/music-error.js";
import type { Track } from "../../../src/domain/music/track.js";
import type { Playlist } from "../../../src/domain/playlists/playlist.js";

const playlist: Playlist = {
  createdBy: "user-1",
  guildId: "guild-1",
  name: "Hipster",
  tracks: [],
};

function track(title: string): Track {
  return {
    artworkUrl: null,
    author: "Resolved Artist",
    durationMs: 1_000,
    isStream: false,
    requesterId: "user-1",
    sourceName: "youtube",
    title,
    uri: `https://youtu.be/${title}`,
  };
}

function repository(overrides: Partial<PlaylistRepository> = {}): PlaylistRepository {
  return {
    addTrack: vi.fn(),
    addTracks: vi.fn((_g: string, _n: string, tracks: readonly Track[]) =>
      Promise.resolve({
        added: tracks.map((value, index) => ({ position: index + 1, track: value })),
        skipped: 0,
      }),
    ),
    create: vi.fn(),
    delete: vi.fn(),
    getByName: vi.fn(() => Promise.resolve(playlist)),
    list: vi.fn(),
    removeTrack: vi.fn(),
    ...overrides,
  };
}

function catalog(tracks: readonly { isrc: string | null; title: string }[]): SpotifyCatalog {
  return {
    getPlaylist: vi.fn(() =>
      Promise.resolve({
        name: "Hipster",
        total: tracks.length,
        tracks: tracks.map((value) => ({
          artist: "Spotify Artist",
          durationMs: 1_000,
          isrc: value.isrc,
          title: value.title,
        })),
      }),
    ),
  };
}

describe("PlaylistService.importFromSpotify", () => {
  it("matches on the ISRC, which pins the exact recording", async () => {
    const music = {
      resolveSelection: vi.fn(() => Promise.resolve({ playlistName: null, tracks: [track("A")] })),
    } as unknown as MusicService;
    const service = new PlaylistService(
      repository(),
      music,
      catalog([{ isrc: "GBAAM0201110", title: "Every Breath You Take" }]),
    );

    await service.importFromSpotify("guild-1", "Hipster", "spotify:playlist:x", "user-1");

    // Quoted so the search engine treats it as one token. An artist/title search would return a
    // video edit of a different length; the ISRC returns the master.
    expect(music.resolveSelection).toHaveBeenCalledWith('"GBAAM0201110"', "user-1");
  });

  it("falls back to artist and title when Spotify has no ISRC", async () => {
    const music = {
      resolveSelection: vi.fn(() => Promise.resolve({ playlistName: null, tracks: [track("A")] })),
    } as unknown as MusicService;
    const service = new PlaylistService(
      repository(),
      music,
      catalog([{ isrc: null, title: "Some Demo" }]),
    );

    await service.importFromSpotify("guild-1", "Hipster", "spotify:playlist:x", "user-1");

    expect(music.resolveSelection).toHaveBeenCalledWith("Spotify Artist - Some Demo", "user-1");
  });

  it("stores what matched and counts what did not, instead of failing the whole import", async () => {
    const music = {
      resolveSelection: vi
        .fn()
        .mockResolvedValueOnce({ playlistName: null, tracks: [track("A")] })
        .mockResolvedValueOnce({ playlistName: null, tracks: [] })
        .mockRejectedValueOnce(new MusicError("TRACK_NOT_FOUND", "nope"))
        .mockResolvedValueOnce({ playlistName: null, tracks: [track("D")] }),
    } as unknown as MusicService;
    const repo = repository();
    const service = new PlaylistService(
      repo,
      music,
      catalog([
        { isrc: "A", title: "A" },
        { isrc: "B", title: "B" },
        { isrc: "C", title: "C" },
        { isrc: "D", title: "D" },
      ]),
    );

    const result = await service.importFromSpotify(
      "guild-1",
      "Hipster",
      "spotify:playlist:x",
      "user-1",
    );

    expect(result).toMatchObject({ added: 2, skipped: 0, sourceName: "Hipster", unmatched: 2 });
    // One insert for the whole import, not one per track: the repository caps and numbers
    // positions in a single transaction.
    expect(repo.addTracks).toHaveBeenCalledTimes(1);
  });

  it("reports how many were dropped by the playlist cap", async () => {
    const music = {
      resolveSelection: vi.fn(() => Promise.resolve({ playlistName: null, tracks: [track("A")] })),
    } as unknown as MusicService;
    const repo = repository({
      addTracks: vi.fn((_g: string, _n: string, tracks: readonly Track[]) =>
        Promise.resolve({
          added: tracks.slice(0, 1).map((value, index) => ({ position: index + 1, track: value })),
          skipped: tracks.length - 1,
        }),
      ),
    });
    const service = new PlaylistService(
      repo,
      music,
      catalog([
        { isrc: "A", title: "A" },
        { isrc: "B", title: "B" },
      ]),
    );

    const result = await service.importFromSpotify(
      "guild-1",
      "Hipster",
      "spotify:playlist:x",
      "user-1",
    );

    expect(result).toMatchObject({ added: 1, skipped: 1, unmatched: 0 });
  });

  it("aborts on an error that would fail every remaining track anyway", async () => {
    const music = {
      resolveSelection: vi
        .fn()
        .mockRejectedValue(new MusicError("UNAUTHORIZED_GUILD", "not allowed")),
    } as unknown as MusicService;
    const service = new PlaylistService(
      repository(),
      music,
      catalog([
        { isrc: "A", title: "A" },
        { isrc: "B", title: "B" },
      ]),
    );

    await expect(
      service.importFromSpotify("guild-1", "Hipster", "spotify:playlist:x", "user-1"),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED_GUILD" });
    expect(music.resolveSelection).toHaveBeenCalledTimes(1);
  });

  it("refuses to import into a playlist that does not exist", async () => {
    const music = { resolveSelection: vi.fn() } as unknown as MusicService;
    const spotify = catalog([{ isrc: "A", title: "A" }]);
    const service = new PlaylistService(
      repository({ getByName: vi.fn(() => Promise.resolve(null)) }),
      music,
      spotify,
    );

    await expect(
      service.importFromSpotify("guild-1", "Missing", "spotify:playlist:x", "user-1"),
    ).rejects.toMatchObject({ code: "PLAYLIST_NOT_FOUND" });
    // Checked before Spotify is called: no point paying for the fetch to then throw it away.
    expect(spotify.getPlaylist).not.toHaveBeenCalled();
  });

  it("says so plainly when Spotify import is not configured", async () => {
    const music = { resolveSelection: vi.fn() } as unknown as MusicService;
    const service = new PlaylistService(repository(), music);

    await expect(
      service.importFromSpotify("guild-1", "Hipster", "spotify:playlist:x", "user-1"),
    ).rejects.toMatchObject({ code: "SPOTIFY_NOT_CONFIGURED" });
  });
});
