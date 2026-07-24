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

## Open Decisions

- Concrete STT adapter (Vosk vs whisper-based) and how the model is provisioned in the
  Docker image (bundled vs volume-mounted).
- Native module footprint (`@discordjs/voice`, `prism-media`, encryption library, Vosk
  bindings) and its impact on the Alpine-based image.
