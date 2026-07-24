# Work-Item: WI-004 - SQLite Settings and Shared Playlists

## Context

The private server needs durable preferences and a shared playlist library without an
external database service.

## Acceptance Criteria

- [x] SQLite uses WAL, foreign keys, versioned migrations, and a configurable data directory.
- [x] Default volume, idle timeout, and announcements persist per guild.
- [x] Shared playlists support create/list/show/add/remove/play/delete.
- [x] Names are case-insensitively unique and playlists are limited to 100 tracks.
- [x] Stored URIs are resolved again at playback and partial failures are reported.
- [x] Backup produces a consistent timestamped database copy.
- [x] Red/Green/Refactor and all quality gates are recorded.
