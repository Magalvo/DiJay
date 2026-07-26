# Work-Spec: Implementation Plan for WI-018

## 1. Target Files

- **Production files:** `src/config/env.ts`, `src/application/audio-actions/*`,
  `src/application/music/*`, `src/infrastructure/lavalink/poru-music-gateway.ts`,
  `src/infrastructure/health/health-server.ts`, `src/bootstrap.ts`, `.env.example`,
  `compose.yml`, `docs/canonical/operations.md`.
- **Test files:** config, manifest loader, audio action service, health server, music service,
  and Poru gateway tests.

## 2. Proposed Technical Approach

Audio clips are not played with `@discordjs/voice` and do not create a second voice connection.
The bot exposes configured files on its existing private HTTP server and asks Lavalink/Poru to
enqueue that internal URL on an already-active player. This keeps audio output on the same path as
music and prevents DiJay from joining voice only to greet someone.

`AudioActionService` owns manifest actions, voice-member-join trigger evaluation, URL creation,
and in-memory cooldowns. The Poru gateway exposes a system enqueue path that returns false when
there is no player or when the player is in another voice channel.

## 3. Testing Strategy (TDD)

- **Red:** Add failing tests for audio action env parsing, manifest validation, static serving,
  service trigger/cooldown behavior, and system enqueue on an existing Poru player.
- **Green:** Implement the minimal manifest loader, service, HTTP file serving, system playback
  path, and Discord voice-state wiring.
- **Refactor:** Run `typecheck`, `lint`, `test`, `build`, and focused Prettier checks for touched
  files. Live validation requires a real clip mounted on the VPS.
