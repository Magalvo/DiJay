# Work Track: WT-001 - Extensible Discord Bot

## Vision

Build DiJay as a reliable music-first Discord bot whose capabilities can expand without
turning command handling, business rules, and third-party SDKs into one coupled module.

## Initial roadmap

1. **WI-001 — Music bot foundation:** slash commands, queue controls, Lavalink adapter,
   validated configuration, CI, and local operations.
2. **WI-002 — Private lifecycle:** single-guild allowlist, idle lifecycle, and safe defaults.
3. **WI-003 — Advanced playback:** volume, seek, loop, queue operations, and controls panel.
4. **WI-004 — Shared playlists:** SQLite settings, shared playlists, and backups.
5. **WI-005 — VPS deployment:** production containers, healthchecks, and operations.
6. **WI-006 — Bot presence:** configurable activity and hardened Lavalink deployment.
7. **WI-007 — Modern UI & live panel:** rich embeds, artwork, `/play` autocomplete, and a
   self-updating control panel. _(Done)_

## Backlog

8. **WI-008 — Audio filters:** bassboost/nightcore/8D presets via Lavalink filters.
9. **WI-009 — Queue pagination & extended controls:** paged `/queue` and previous/volume
   buttons backed by a playback-history buffer.
10. **WI-010 — Components V2 panel:** image-forward control panel using Discord Components V2.
11. **WI-011 — Spotify import & playback:** LavaSrc-backed Spotify URLs and playlist import.
12. **WI-012 — Voice command recognition:** opt-in open-source speech-to-text control.

Every future item must define acceptance criteria and failing tests before implementation.
