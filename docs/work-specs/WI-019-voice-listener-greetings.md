# Work-Spec: Implementation Plan for WI-019

## 1. Target Files

- **Production files:** `src/config/env.ts`, `src/voice-listener/main.ts`,
  `src/voice-listener/voice-greeting-player.ts`, `.env.example`,
  `compose.voice-listener.yml`, `docs/canonical/operations.md`.
- **Test files:** `tests/unit/config/env.test.ts`,
  `tests/unit/voice-listener/voice-greeting-player.test.ts`.

## 2. Proposed Technical Approach

Keep WI-018's Lavalink-backed audio actions for the main bot, but add a small DiJayMic-only
greeting path for the sidecar that already owns the automatic voice connection. After the
hands-free listener joins and reaches `VoiceConnectionStatus.Ready`, it subscribes a temporary
`@discordjs/voice` audio player to that same connection and plays the configured local clip.

The sidecar does not join just for greetings; it only greets as part of the existing
hands-free auto-join flow. Cooldown is in memory and keyed by channel id.

## 3. Testing Strategy (TDD)

- **Red:** Config tests expect the new `VOICE_GREETING_*` fields and unit tests expect a
  `VoiceGreetingPlayer` to play once, skip within cooldown, and no-op when no file is configured.
- **Green:** Implement config parsing, greeting player, and wire it after wake-listener join.
- **Refactor:** Run `typecheck`, `typecheck:voice`, `lint`, `test`, `build`, and `build:voice`.
