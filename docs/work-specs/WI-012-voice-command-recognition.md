# Work-Spec: WI-012 - Open-Source Voice Command Recognition

## Target Files

- **Production files:** `src/infrastructure/voice/voice-receiver.ts` (new,
  `@discordjs/voice` receiver + Opus decode), `src/infrastructure/voice/stt-engine.ts`
  (new, STT port + adapter), `src/application/voice/voice-command-service.ts` (new,
  phrase -> action mapping), `src/domain/voice/voice-command.ts` (new grammar),
  `src/config/env.ts`, `src/bootstrap.ts`
- **Test files:** `tests/unit/domain/voice-command.test.ts` (new),
  `tests/unit/application/voice-command-service.test.ts` (new)

## Approach

Keep the SDK-heavy pieces (voice receive, Opus decode, STT) in `infrastructure` behind a
narrow `SpeechToText` port so the application layer stays testable and provider-agnostic.
A domain grammar maps a bounded set of phrases to intents; the application service
translates intents to `MusicService` calls, reusing existing authorization and error
handling. The receiver buffers per-user PCM after the wake word, sends it to the STT port,
and discards audio immediately. The feature is gated by a per-guild opt-in setting and an
env flag, and adds `GatewayIntentBits.GuildVoiceStates` (already present).

## TDD

- **Red:** Grammar and service tests assert that fixed transcripts map to the right
  `MusicService` calls and that unknown phrases are ignored.
- **Green:** Implement the grammar and intent dispatch against a mocked STT port.
- **Refactor:** Isolate native/model concerns in infrastructure, document setup and the
  privacy stance, and run all gates.

## Resolved Decisions

- **STT adapter:** `vosk-koffi` (the npm `vosk` package pulls the abandoned `ffi-napi`,
  which does not build on Node 24). The model is **volume-mounted from the host**, not baked
  into the image, so switching models needs no rebuild.
- **Native footprint:** the voice packages are `optionalDependencies` and stay out of the
  lean Alpine image. `Dockerfile.voice` (Debian/glibc) installs them for the voice
  deployment; `tsconfig.build.json` excludes `src/infrastructure/voice/**`, which is
  type-checked separately via `npm run typecheck:voice`.

## Execution Record

- **Red:** Grammar and service tests failed first, covering intent mapping, the optional
  wake word, skip-vs-stop disambiguation, spoken volume levels, and ignoring unknown speech.
- **Green:** Domain grammar, `VoiceCommandService`, the `SpeechToText` port, the Vosk
  adapter, and the `/listen` capture path satisfied them.
- **Refactor:** Native concerns isolated behind the port and a dynamic import; packaging
  kept the production image unchanged.
- **Gates:** `format:check`, `lint`, `typecheck`, `typecheck:voice`, tests, and `build` all
  passed.

### Post-deployment fixes

Live use surfaced defects that unit tests could not reach, each fixed and re-verified:

1. `/listen` hung forever — the capture promise only resolved on `end`/`error`, but the
   timeout used `destroy()` (which emits `close`) and a silent speaker emits neither.
2. `undefined is not iterable` — without `setMaxAlternatives`, Vosk returns `{ text }`, not
   `{ alternatives }`.
3. Silence surfaced as `The operation was aborted` instead of an empty capture.
4. Accuracy was poor with open recognition, so the recognizer is now given a constrained
   command grammar, and 48kHz→16kHz downmixing averages sample groups instead of dropping
   samples.
5. The transcript was logged at `info`; moved to `debug` during the August 2026 audit.
