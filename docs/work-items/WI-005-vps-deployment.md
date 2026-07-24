# Work-Item: WI-005 - VPS Deployment

## Context

DiJay needs a reproducible, private, observable deployment for one VPS.

## Acceptance Criteria

- [x] Multi-stage non-root bot image and private bot/Lavalink network are defined.
- [x] SQLite data persists and service ports are not publicly published.
- [x] Health is 200 only when Discord and Lavalink are ready; otherwise it is 503.
- [x] Both services restart automatically, rotate logs, and have memory limits.
- [x] Backup, restore, update, rollback, and local development are documented.
- [x] Shutdown closes interactions, audio, Discord, HTTP, and SQLite.
- [x] Docker build and Compose validation join the existing quality gates.
