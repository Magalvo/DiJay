import { describe, expect, it, vi } from "vitest";

import { SpotifyWebApiCatalog } from "../../../src/infrastructure/spotify/spotify-web-api-catalog.js";

const credentials = { clientId: "id", clientSecret: "secret", refreshToken: "refresh" };

function jsonResponse(body: unknown, status = 200): Response {
  return { json: () => Promise.resolve(body), ok: status < 400, status } as Response;
}

function page(names: readonly string[], total: number) {
  return {
    items: names.map((name) => ({
      track: {
        artists: [{ name: "Artist" }],
        duration_ms: 1_000,
        external_ids: { isrc: "ISRC1" },
        name,
        type: "track",
      },
    })),
    total,
  };
}

describe("SpotifyWebApiCatalog", () => {
  it("refreshes the access token once and reuses it across requests", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: "token-1", expires_in: 3_600 }))
      .mockResolvedValueOnce(jsonResponse({ name: "Hipster" }))
      .mockResolvedValueOnce(jsonResponse(page(["A"], 1)));
    const catalog = new SpotifyWebApiCatalog(credentials, fetchImpl);

    await catalog.getPlaylist("https://open.spotify.com/playlist/4cOdK2wGLETKBW3PvgPWqT", 600);

    const tokenCalls = fetchImpl.mock.calls.filter(([url]) =>
      String(url).includes("accounts.spotify.com"),
    );
    expect(tokenCalls).toHaveLength(1);
    // A user refresh token, not client credentials: playlist items are only readable as the
    // account that owns the playlist.
    const body = (tokenCalls[0]![1] as RequestInit).body;
    expect(body).toBeInstanceOf(URLSearchParams);
    expect((body as URLSearchParams).get("grant_type")).toBe("refresh_token");
    for (const [, init] of fetchImpl.mock.calls.slice(1)) {
      expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer token-1" });
    }
  });

  it("re-refreshes once the access token has expired", async () => {
    let now = 0;
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: "token-1", expires_in: 3_600 }))
      .mockResolvedValueOnce(jsonResponse({ name: "One" }))
      .mockResolvedValueOnce(jsonResponse(page(["A"], 1)))
      .mockResolvedValueOnce(jsonResponse({ access_token: "token-2", expires_in: 3_600 }))
      .mockResolvedValueOnce(jsonResponse({ name: "Two" }))
      .mockResolvedValueOnce(jsonResponse(page(["B"], 1)));
    const catalog = new SpotifyWebApiCatalog(credentials, fetchImpl, () => now);

    await catalog.getPlaylist("4cOdK2wGLETKBW3PvgPWqT", 600);
    now = 3_600_000;
    await catalog.getPlaylist("4cOdK2wGLETKBW3PvgPWqT", 600);

    expect(
      fetchImpl.mock.calls.filter(([url]) => String(url).includes("accounts.spotify.com")),
    ).toHaveLength(2);
  });

  it("pages until the playlist runs out", async () => {
    const full = Array.from({ length: 100 }, (_, index) => `Track ${index + 1}`);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: "token", expires_in: 3_600 }))
      .mockResolvedValueOnce(jsonResponse({ name: "Hipster" }))
      .mockResolvedValueOnce(jsonResponse(page(full, 125)))
      .mockResolvedValueOnce(jsonResponse(page(["Track 101"], 125)));
    const catalog = new SpotifyWebApiCatalog(credentials, fetchImpl);

    const playlist = await catalog.getPlaylist("4cOdK2wGLETKBW3PvgPWqT", 600);

    expect(playlist.tracks).toHaveLength(101);
    expect(playlist.total).toBe(125);
    const itemUrls = fetchImpl.mock.calls
      .map(([url]) => String(url))
      .filter((url) => url.includes("/items"));
    expect(itemUrls[0]).toContain("offset=0");
    expect(itemUrls[1]).toContain("offset=100");
  });

  it("stops requesting pages once the cap is reached", async () => {
    const full = Array.from({ length: 100 }, (_, index) => `Track ${index + 1}`);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: "token", expires_in: 3_600 }))
      .mockResolvedValueOnce(jsonResponse({ name: "Huge" }))
      .mockResolvedValueOnce(jsonResponse(page(full, 5_000)));
    const catalog = new SpotifyWebApiCatalog(credentials, fetchImpl);

    const playlist = await catalog.getPlaylist("4cOdK2wGLETKBW3PvgPWqT", 100);

    expect(playlist.tracks).toHaveLength(100);
    expect(
      fetchImpl.mock.calls.map(([url]) => String(url)).filter((url) => url.includes("/items")),
    ).toHaveLength(1);
  });

  it("accepts the renamed item field from the March 2026 API migration", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: "token", expires_in: 3_600 }))
      .mockResolvedValueOnce(jsonResponse({ name: "Migrated" }))
      .mockResolvedValueOnce(
        jsonResponse({
          items: [
            {
              item: {
                artists: [{ name: "Artist" }],
                duration_ms: 1_000,
                external_ids: { isrc: "ISRC9" },
                name: "Renamed",
                type: "track",
              },
            },
          ],
          total: 1,
        }),
      );
    const catalog = new SpotifyWebApiCatalog(credentials, fetchImpl);

    const playlist = await catalog.getPlaylist("4cOdK2wGLETKBW3PvgPWqT", 600);

    expect(playlist.tracks).toEqual([
      { artist: "Artist", durationMs: 1_000, isrc: "ISRC9", title: "Renamed" },
    ]);
  });

  it("skips nulls and episodes, and never trusts a local file's ISRC", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: "token", expires_in: 3_600 }))
      .mockResolvedValueOnce(jsonResponse({ name: "Mixed" }))
      .mockResolvedValueOnce(
        jsonResponse({
          items: [
            { track: null },
            { track: { name: "An episode", type: "episode" } },
            {
              track: {
                artists: [{ name: "Artist" }],
                duration_ms: 1_000,
                external_ids: { isrc: "SHOULD-BE-IGNORED" },
                is_local: true,
                name: "Local file",
                type: "track",
              },
            },
          ],
          total: 3,
        }),
      );
    const catalog = new SpotifyWebApiCatalog(credentials, fetchImpl);

    const playlist = await catalog.getPlaylist("4cOdK2wGLETKBW3PvgPWqT", 600);

    // The local file survives as a track but must not carry an ISRC: it identifies no real
    // recording, so matching on it would pull in an unrelated one.
    expect(playlist.tracks).toEqual([
      { artist: "Artist", durationMs: 1_000, isrc: null, title: "Local file" },
    ]);
  });

  it.each([
    ["https://open.spotify.com/playlist/4cOdK2wGLETKBW3PvgPWqT?si=abc"],
    ["https://open.spotify.com/intl-pt/playlist/4cOdK2wGLETKBW3PvgPWqT"],
    ["spotify:playlist:4cOdK2wGLETKBW3PvgPWqT"],
    ["4cOdK2wGLETKBW3PvgPWqT"],
  ])("accepts %s as a playlist reference", async (reference) => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: "token", expires_in: 3_600 }))
      .mockResolvedValueOnce(jsonResponse({ name: "Any" }))
      .mockResolvedValueOnce(jsonResponse(page([], 0)));
    const catalog = new SpotifyWebApiCatalog(credentials, fetchImpl);

    await catalog.getPlaylist(reference, 600);

    expect(String(fetchImpl.mock.calls[1]![0])).toContain("/playlists/4cOdK2wGLETKBW3PvgPWqT");
  });

  it("rejects something that is not a playlist reference", async () => {
    const catalog = new SpotifyWebApiCatalog(credentials, vi.fn());

    await expect(catalog.getPlaylist("not a playlist", 600)).rejects.toMatchObject({
      code: "INVALID_SPOTIFY_REFERENCE",
    });
  });

  it.each([403, 404])(
    "reports a %i from Spotify as an unavailable playlist, not an internal failure",
    async (status) => {
      const fetchImpl = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ access_token: "token", expires_in: 3_600 }))
        .mockResolvedValueOnce(jsonResponse({ error: "nope" }, status));
      const catalog = new SpotifyWebApiCatalog(credentials, fetchImpl);

      await expect(catalog.getPlaylist("4cOdK2wGLETKBW3PvgPWqT", 600)).rejects.toMatchObject({
        code: "SPOTIFY_PLAYLIST_UNAVAILABLE",
      });
    },
  );

  it("reports a revoked refresh token distinctly from an outage", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse({ error: "invalid_grant" }, 400));
    const catalog = new SpotifyWebApiCatalog(credentials, fetchImpl);

    await expect(catalog.getPlaylist("4cOdK2wGLETKBW3PvgPWqT", 600)).rejects.toMatchObject({
      code: "SPOTIFY_NOT_AUTHORISED",
    });
  });
});
