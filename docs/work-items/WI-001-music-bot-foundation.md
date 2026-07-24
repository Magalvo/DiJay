# Work-Item: WI-001 - Music Bot Foundation

## 1. Context & Problem

Create the first production-shaped slice of DiJay: a Discord bot focused on music, while
keeping Discord, Lavalink, and future features separated by explicit boundaries.

## 2. Acceptance Criteria

- [x] The bot exposes `/play`, `/pause`, `/resume`, `/skip`, `/stop`, `/queue`,
      `/nowplaying`, `/help`, and `/ping` slash commands.
- [x] `/play` requires the requester to be in a voice channel, accepts a URL or search
      query, queues one track or a playlist, and starts playback when the player is idle.
- [x] Playback controls only act on the requester's guild and voice channel.
- [x] Empty searches and missing tracks produce user-safe errors.
- [x] Queue output is bounded so Discord message limits are respected.
- [x] Runtime configuration is validated at startup and secrets are only read from the
      environment.
- [x] Music transport is behind an application port so future providers and features do
      not depend on Poru or Lavalink types.
- [x] Unit tests cover input validation, playback orchestration, queue presentation, and
      configuration.
- [x] `npm run typecheck`, `npm run lint`, `npm run test`, and `npm run build` pass.
- [x] Local setup is documented and includes a Lavalink v4 Docker service.
