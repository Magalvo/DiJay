# Work-Item: WI-012 - Open-Source Voice Command Recognition

## Context

As a personal, non-commercial bot, DiJay should optionally accept spoken commands while in
a voice channel. This requires receiving Discord voice audio and transcribing it with an
open-source speech-to-text engine. A wake word gates recognition so the bot is not
transcribing continuously, which matters for both privacy and cost. Audio must be processed
in memory and never persisted.

## Candidate Engines (open-source)

- **Vosk** — fully offline, permissive licence, light models. Recommended default.
- **whisper.cpp / faster-whisper** — higher accuracy, heavier CPU/GPU and larger models.
- Optional wake word via **openWakeWord** or a simple keyword-spot on the transcript.

## Acceptance Criteria

- [x] The chosen STT engine and wake-word strategy are recorded before implementation.
- [x] The bot joins voice and receives per-user Opus audio via `@discordjs/voice`, decoded
      to PCM in memory only.
- [x] A configurable wake word (default "DiJay") gates transcription; nothing is written to
      disk and no transcript content is logged.
- [x] A bounded command grammar maps recognized phrases to existing music actions
      (play/pause/skip/stop/volume) through `MusicService`, reusing its guards.
- [x] Voice control is opt-in per guild, disabled by default, with a privacy note in the
      README.
- [x] Oversized audio, silence timeouts, and recognition failures are handled without
      crashing the player.
- [x] Red/Green/Refactor and all quality gates are recorded.

### Notes on how the criteria were met

- **Wake word.** This item shipped as push-to-talk (`/listen`), where the wake word is
  accepted but optional rather than gating — the slash command is what arms recognition.
  Wake-word gating proper arrived with [WI-014](WI-014-wake-word-listening.md), which also
  moved listening out of the main bot ([WI-013](WI-013-voice-listener-sidecar.md)).
- **Transcript logging.** Audio is never written to disk, and at the default `info` level no
  spoken content is logged. The transcript is available only at `debug`, an explicit
  operator opt-in for diagnosing recognition. Re-checked and corrected during the August
  2026 audit, after hands-free listening made continuous transcription possible.
- **Opt-in.** `VOICE_ENABLED` defaults to false; per-guild toggles live under `/settings`
  (`voice-commands`, `voice-sounds`, `voice-join-greeting`).

## Resolved Decisions

- **STT engine:** Vosk, offline, with the small Portuguese model
  (`vosk-model-small-pt-0.3`, Apache-2.0). Chosen over whisper-based engines for the
  memory ceiling of the container and a permissive licence; the small model is enough for a
  closed command vocabulary. The npm `vosk` package is unusable on Node 24 (it depends on
  the abandoned `ffi-napi`), so the binding is `vosk-koffi`.
- **Activation:** push-to-talk for this item. Continuous listening was deliberately deferred
  because the main bot cannot hold a second voice connection — see WI-013/WI-014.
