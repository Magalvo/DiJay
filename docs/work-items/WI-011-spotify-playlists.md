# Work-Item: WI-011 - Spotify Playlist Import and Playback

## Context

Members want to queue Spotify tracks, albums, and playlists by URL. Lavalink cannot stream
Spotify audio directly; the established approach is the LavaSrc Lavalink plugin, which
reads Spotify metadata through the Spotify Web API and mirrors playback through a supported
source (YouTube/Deezer). This keeps DiJay within licensed audio while accepting Spotify
links. Spotify credentials are required and configured out of band.

## Acceptance Criteria

- [x] LavaSrc is enabled in the Lavalink image with Spotify client credentials supplied via
      environment variables (no secrets committed).
- [x] `/play` accepts Spotify track, album, and playlist URLs and enqueues the resolved
      tracks with correct requester attribution. (Poru forwards URLs verbatim to LavaSrc; the
      gateway enqueues every track of a `playlist` load.)
- [x] Spotify playlists can be saved into the existing SQLite shared-playlist storage.
      (`/playlist add <url>` now imports the whole album/playlist via `addTracks`.)
- [x] Region-locked or unresolvable tracks are skipped and reported, never fatal.
      (LavaSrc omits unplayable tracks server-side; imports past the 100-track cap are
      skipped and the count is reported to the user.)
- [x] Missing or invalid Spotify configuration degrades gracefully to non-Spotify sources
      and is logged at startup. (`config.spotify.configured` is logged on boot.)
- [x] Source licensing is respected: no attempt to stream Spotify audio directly.
      (LavaSrc mirrors audio through `ytsearch`; the `spotify` source is metadata-only.)
- [x] Red/Green/Refactor and all quality gates are recorded.

## Open Decisions

- Mirror source for playback: YouTube (default, no extra keys) vs Deezer (needs config).
- Whether Spotify links are allowed only via `/play` or also a dedicated `/import` command.
