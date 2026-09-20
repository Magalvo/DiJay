# Work-Spec: Implementation Plan for WI-023

## 1. Target Files

- **Files to create:** `src/application/spotify/spotify-catalog.ts` (port),
  `src/infrastructure/spotify/spotify-web-api-catalog.ts` (adapter),
  `src/infrastructure/spotify/authorize-spotify.ts` (one-off CLI)
- **Files to modify:** `src/application/playlists/playlist-service.ts`,
  `src/domain/playlists/playlist.ts`, `src/domain/music/music-error.ts`, `src/config/env.ts`,
  `src/bootstrap.ts`, `src/presentation/discord/command-data.ts`,
  `src/presentation/discord/commands.ts`, `src/presentation/discord/user-messages.ts`,
  `package.json`, `.env.example`, `docs/canonical/operations.md`
- **Test files to create:** `tests/unit/infrastructure/spotify-web-api-catalog.test.ts`,
  `tests/unit/application/playlist-spotify-import.test.ts`

## 2. Proposed Technical Approach

`SpotifyCatalog` is a port in the application layer with one method, `getPlaylist(reference,
limit)`, and no concept of audio, streaming or playback - the bot needs a track list and nothing
else. `SpotifyWebApiCatalog` implements it over the Web API, taking `fetch` and a clock as
constructor parameters so the token lifecycle is testable without network or timers.

`PlaylistService` takes the catalog as an optional third dependency. Absent, `/playlist import`
fails with `SPOTIFY_NOT_CONFIGURED` and nothing else in the service changes; the rest of the bot
does not know the feature exists.

### Why a user token, and why that is not a design choice

Client credentials cannot do this. Verified against the live API with credentials whose owner
account holds Premium:

| Request                                    | Result                                       |
| ------------------------------------------ | -------------------------------------------- |
| `GET /v1/tracks/{id}`                      | 200                                          |
| `GET /v1/playlists/{id}`                   | 200, **with the tracks field omitted**       |
| `GET /v1/playlists/{id}/tracks`            | 403 (deprecated in the March 2026 migration) |
| `GET /v1/playlists/{id}/items`             | 401                                          |
| `GET /v1/tracks?ids=` / `/v1/artists?ids=` | 403                                          |
| `GET /v1/playlists/37i9dQZ.../items`       | 404                                          |

With a user token from the account that owns the playlist, the same `items` endpoint answers 200
with the full contents. An app in Development Mode only receives items for playlists the
authenticated user owns or collaborates on, so third-party public playlists stay at 403 and
Spotify-generated ones at 404 regardless. Those are surfaced as
`SPOTIFY_PLAYLIST_UNAVAILABLE` with a Portuguese message that says which playlists do work.

The endpoint reads both `track` and `item` on each entry: the March 2026 migration renamed the
field, and accepting both means the adapter works whichever shape the account's app is served.

### Why ISRC matching, and what it buys

Each track is matched to a playable source at import time and it is that match which is stored,
so `/playlist play` and the queue never touch Spotify again. The query is the ISRC in quotes,
falling back to `artist - title`. The ISRC identifies the exact recording rather than the song,
which is not a theoretical distinction - resolved against Lavalink:

| Query                                         | Result                                            |
| --------------------------------------------- | ------------------------------------------------- |
| `ytsearch:"GBAAM0201110"`                     | Every Breath You Take - The Police, **254000 ms** |
| `ytsearch:The Police - Every Breath You Take` | official video edit, **229000 ms**                |

The text search returns a video edit 25 seconds shorter than the master. Across a real 125-track
playlist the ISRC path matched 122.

## 3. Testing Strategy (TDD)

- **Initial Failing Test (Red):** `PlaylistService.importFromSpotify` asserts the resolver is
  called with `'"GBAAM0201110"'` - the quoted ISRC - for a track that has one. It fails before
  the method exists, and would fail again if matching ever silently degraded to artist/title,
  which is the regression that would quietly import wrong recordings.
- **Expected Input Data:** a stub catalog returning tracks with and without ISRCs; stubbed
  `fetch` responses covering token refresh, expiry, 100-item pages, the renamed `item` field,
  nulls/episodes/local files, 403, 404 and a revoked refresh token.
- **Expected Output/Behavior:** ISRC tracks query the quoted ISRC and ISRC-less ones fall back to
  `artist - title`; one insert per import rather than per track; unmatched and cap-skipped counts
  reported separately; `UNAUTHORIZED_GUILD` aborts the whole import while `TRACK_NOT_FOUND` costs
  one track; the playlist is checked to exist before Spotify is called at all.

### End-to-end verification

Stubs cannot show that the API behaves as assumed, so the real path was run against a real
playlist ("Hipster", 125 tracks):

```
playlist:        Hipster
total upstream:  125
faixas obtidas:  125        (two pages, 100 + 25)
com ISRC:        125/125
```

and those 125 queries resolved through a live Lavalink:

```
resolvidas: 122
sem match:  3
tempo:      24.4s  (195ms por faixa)
```

195 ms per track puts a full 600-track import at roughly two minutes, well inside Discord's
15-minute deferred-reply window, so the import is deferred but needs no batching or concurrency.
The three unmatched tracks are reported to the user rather than silently dropped.
