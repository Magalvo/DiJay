# Work-Spec: Implementation Plan for WI-016

## 1. Target Files

- **Production files:**
  - `src/domain/settings/guild-settings.ts` — add `voiceLanguage` to `GuildSettings`/update.
  - `src/infrastructure/sqlite/database.ts` — migration v2 adds `voice_language` (default `pt`).
  - `src/infrastructure/sqlite/sqlite-guild-settings-repository.ts` — read/write the column.
  - `src/application/settings/guild-settings-service.ts` — validate `voiceLanguage`
    (`INVALID_VOICE_LANGUAGE`, added to `music-error.ts` + `user-messages.ts`).
  - `src/infrastructure/ipc/voice-command-{contract,server,client}.ts` — a `/voice/language` GET
    endpoint (auth + allowlist) returning the guild's language; `language` added to the command
    request so the bot parses with the matching grammar; `fetchVoiceLanguage` client helper.
  - `src/application/voice/voice-command-service.ts` — `handle` accepts an optional language.
  - `src/config/env.ts` — `VOICE_STT_MODEL_PATH_PT`/`_EN` → `voice.modelPaths`.
  - `src/presentation/discord/command-data.ts` + `commands.ts` — `/settings voice-language`.
  - `src/presentation/discord/embeds.ts` — refreshed `/help`.
  - `src/infrastructure/voice/discord-voice-listener.ts` — swappable STT (`useSpeechToText`).
  - `src/voice-listener/main.ts` — load the active model, poll the bot, reload on change, tag
    forwarded commands with the active language.
  - `src/bootstrap.ts` — wire `currentLanguage` + language pass-through into the IPC dispatch.
- **Test files:** `tests/unit/config/env.test.ts` (model-path derivation),
  `tests/integration/sqlite/repositories.test.ts` (voice_language round-trip),
  `tests/unit/infrastructure/voice-command-server.test.ts` (language endpoint + command tag),
  `tests/unit/application/guild-settings-service.test.ts` (validation). The sidecar reload/poll
  is validated via `typecheck:voice` / `build:voice`.

## 2. Proposed Technical Approach

Keep the language in the existing per-guild settings store (single source of truth). The command
writes it; the listener follows it. Propagation reuses the one-way IPC: the bot exposes a small
authenticated GET the listener polls, and the listener reloads the single active Vosk model on
change (≈1-2s, staying within the 512MB sidecar limit) rather than holding both. The old native
model is freed on a short delay so an in-flight capture never reads freed memory. The bot parses
spoken commands per language, so the listener tags each forwarded command with the language it
recognized in, keeping the bot's grammar in step without the bot re-reading settings per command.

## 3. Testing Strategy (TDD)

- **Red:** env test expects `voice.modelPaths` derivation; repo test expects `voice_language`
  default `pt` and update to `en`; server test expects the language endpoint to honor
  secret/allowlist/guild and the command handler to receive the tagged language; service test
  expects `INVALID_VOICE_LANGUAGE` on a bad value with no repository write.
- **Green:** add the column/migration, config, endpoint + client, command, and the sidecar
  reload/poll.
- **Refactor:** keep the domain unaware of transport, document the toggle and dual-model setup
  in `operations.md` / `.env.example`, and run all gates (`typecheck`, `typecheck:voice`,
  `lint`, `test`, `build`, `build:voice`).

## Open Decisions

- Whether to preload both models for an instant switch if the ≈1-2s reload proves noticeable.
- Whether to surface the active language in `/nowplaying` or the control panel.
