# Work-Item: WI-016 - Runtime Voice Language Toggle (PT/EN)

## Context

The voice recognition language is fixed at boot by `VOICE_LANGUAGE`, and the Vosk model is
loaded once in the listener sidecar. Changing PT↔EN meant editing env and rebuilding the
sidecar. Members want to switch language from Discord, live, without a restart — e.g. after
finding the bot was running the English model while speaking Portuguese.

The language is stored as a per-guild setting (SQLite, alongside volume/idle-timeout). The
listener does not share that database, and IPC runs one way (listener → bot), so the listener
learns the current language by polling a new authenticated GET endpoint on the main bot and
reloads its Vosk model when it changes. Both per-language models must be present on disk; a
switch to a language with no model is a logged no-op. Because the main bot also parses spoken
commands with a per-language grammar, the listener tags each forwarded command with the language
it recognized it in, so the bot parses with the matching grammar.

## Acceptance Criteria

- [x] `/settings voice-language <pt|en>` persists the choice per guild (new `voice_language`
      column, migration v2, default `pt`) and is validated (`INVALID_VOICE_LANGUAGE`).
- [x] The listener follows the setting live: it polls the main bot's `/voice/language` endpoint
      and reloads the active Vosk model within one interval, no restart. The old native model is
      freed only after in-flight captures finish.
- [x] Both models are supported via `VOICE_STT_MODEL_PATH_PT`/`_EN`; with only one, switching to
      the missing language is a logged no-op. `VOICE_STT_MODEL_PATH` stays as the back-compat
      path for `VOICE_LANGUAGE`.
- [x] The language endpoint reuses the shared-secret + allowlist gate; the command language is
      carried on the IPC request so the bot parses with the matching grammar.
- [x] `/help` reflects the current command set, including voice (wake word, soundboard, the new
      language toggle).
- [x] Red/Green/Refactor and all quality gates are recorded.

## Resolved Decisions

- **Propagation:** network poll over the existing IPC (no DB mount in the sidecar), chosen with
  the requester over a restart-based approach.
- **Model swap:** reload the single active model on change (≈1-2s) rather than holding both in
  RAM, keeping the sidecar within its 512MB limit.
- **Command home:** `/settings voice-language` (consistent with the existing `/settings` group).

## Implementation status

Code-complete and unit-tested for the testable surface (settings persistence + validation, the
`/voice/language` handler, per-language model-path parsing, command-language pass-through). The
sidecar's model reload + poll loop is validated via `typecheck:voice` / `build:voice`, like the
rest of the receive infrastructure, and needs live validation on the VPS with both models
present and the second bot in a channel.
