# Work-Item: WI-003 - Advanced Playback

## Context

Private users need complete playback and queue controls without DJ roles or vote systems.

## Acceptance Criteria

- [x] Volume, loop, seek, shuffle, remove, clear, and positional play are supported.
- [x] Queue positions are 1-based; clear and shuffle affect upcoming tracks only.
- [x] Livestreams and invalid positions cannot be sought.
- [x] `/control` exposes a reusable public button panel backed by current player state.
- [x] Components enforce the same guild and voice-channel rules as commands.
- [x] Red/Green/Refactor and all quality gates are recorded.
