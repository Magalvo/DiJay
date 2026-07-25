# Work-Spec: Implementation Plan for WI-015

## 1. Target Files

- **Production files:**
  - `src/domain/voice/voice-command.ts` — add a `soundboardTriggers` entry to each language
    vocabulary, add the trigger word(s) to the grammar, and export a pure
    `matchSoundboardTrigger(transcript, language)` returning the sound key or null (whole-token
    match, no wake word required).
  - `src/config/env.ts` — `VOICE_SOUNDBOARD_SOUNDS` parsed into a `key -> soundId` record
    (comma-separated `key:snowflake` pairs), validated and empty by default.
  - `src/voice-listener/main.ts` — in the hands-free `onSpeak` path, check
    `matchSoundboardTrigger` first; on a configured hit, send the sound via
    `VoiceChannel.sendSoundboardSound({ soundId })` and skip the IPC path. Join unmuted.
- **Test files:**
  - `tests/unit/domain/voice-command.test.ts` — trigger match (hit, whole-token, miss) and the
    grammar entry, per language.
  - `tests/unit/config/env.test.ts` — `VOICE_SOUNDBOARD_SOUNDS` parsing and malformed-entry
    rejection.
  - The native soundboard send in the listener is validated via `typecheck:voice` /
    `build:voice`, consistent with the rest of the receive infrastructure.

## 2. Proposed Technical Approach

Keep the main bot, Lavalink, and the WI-013 IPC untouched — WI-015 is entirely inside the
listener plus a small domain helper and one config value. Recognition reuses the constrained
Vosk grammar: the trigger word is added so it can be transcribed at all. In the hands-free
receive loop, each utterance is first checked for a soundboard trigger (self-contained, so it
does not go through the `dj` wake-word gate); a configured hit is played through Discord's native
soundboard from the listener's own voice connection, overlaying the music without a second
Lavalink stream. The trigger -> id mapping is configuration so server-specific ids stay out of
code; an unconfigured trigger simply falls through to the normal command path.

Trade-offs settled in implementation: the listener must join unmuted for Discord to accept the
send, which is harmless because listening is receive-side. Send failures (missing
`UseSoundboard`, muted, channel gone) are caught and logged, never affecting playback.

## 3. Testing Strategy (TDD)

- **Red:** Domain tests assert `matchSoundboardTrigger("gelado")` → "gelado",
  `"congelado"` → null, `"dj salta"` → null, and that the grammar contains the trigger; config
  tests assert `VOICE_SOUNDBOARD_SOUNDS` parses `key:id` pairs and rejects malformed input.
- **Green:** Add the vocabulary entry, grammar word, matcher, config parsing, and the listener
  send.
- **Refactor:** Keep the domain unaware of Discord, document the setup and permission in
  `.env.example` and `operations.md`, and run all gates (`typecheck`, `typecheck:voice`, `lint`,
  `test`, `build`, `build:voice`).

## Open Decisions

- Additional trigger words / sounds beyond `gelado` (the mechanism already supports several).
- Whether to add an optional per-guild cooldown specific to soundboard spamming, beyond the
  existing WI-014 per-user cooldown.
