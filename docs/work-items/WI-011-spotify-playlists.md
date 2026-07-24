# Work-Item: WI-011 - Spotify Playlist Import and Playback

## Context

Members want to queue Spotify tracks, albums, and playlists by URL. Lavalink cannot stream
Spotify audio directly; the established approach is the LavaSrc Lavalink plugin, which
reads Spotify metadata through the Spotify Web API and mirrors playback through a supported
source (YouTube/Deezer). This keeps DiJay within licensed audio while accepting Spotify
links. Spotify credentials are required and configured out of band.

## Acceptance Criteria

- [ ] LavaSrc is enabled in the Lavalink image with Spotify client credentials supplied via
      environment variables (no secrets committed).
- [ ] `/play` accepts Spotify track, album, and playlist URLs and enqueues the resolved
      tracks with correct requester attribution.
- [ ] Spotify playlists can be saved into the existing SQLite shared-playlist storage.
- [ ] Region-locked or unresolvable tracks are skipped and reported, never fatal.
- [ ] Missing or invalid Spotify configuration degrades gracefully to non-Spotify sources
      and is logged at startup.
- [ ] Source licensing is respected: no attempt to stream Spotify audio directly.
- [ ] Red/Green/Refactor and all quality gates are recorded.

## Open Decisions

- Mirror source for playback: YouTube (default, no extra keys) vs Deezer (needs config).
- Whether Spotify links are allowed only via `/play` or also a dedicated `/import` command.
