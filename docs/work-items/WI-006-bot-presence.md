# Work-Item: WI-006 - Bot Presence and Deployment Hardening

## Context

DiJay needs a visible activity that directs members to its main command. The first VPS
deployment also exposed two Compose issues: the Lavalink plugin cache was not writable
by its non-root user, and the authenticated `/version` route was unsuitable for an
unauthenticated healthcheck.

## Acceptance Criteria

- [x] The bot activity text is configurable and defaults to `música | /play`.
- [x] The activity is published as `Listening` when Discord becomes ready.
- [x] The Lavalink healthcheck does not require credentials.
- [x] Lavalink can download plugins without a root-owned named volume.
- [x] `format:check`, `typecheck`, `lint`, tests, build, and Compose validation pass.
