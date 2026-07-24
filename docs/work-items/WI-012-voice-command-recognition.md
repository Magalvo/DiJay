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

- [ ] The chosen STT engine and wake-word strategy are recorded before implementation.
- [ ] The bot joins voice and receives per-user Opus audio via `@discordjs/voice`, decoded
      to PCM in memory only.
- [ ] A configurable wake word (default "DiJay") gates transcription; nothing is written to
      disk and no transcript content is logged.
- [ ] A bounded command grammar maps recognized phrases to existing music actions
      (play/pause/skip/stop/volume) through `MusicService`, reusing its guards.
- [ ] Voice control is opt-in per guild, disabled by default, with a privacy note in the
      README.
- [ ] Oversized audio, silence timeouts, and recognition failures are handled without
      crashing the player.
- [ ] Red/Green/Refactor and all quality gates are recorded.

## Open Decisions

- STT engine (Vosk offline vs whisper-based accuracy) and model size.
- Whether recognition is push-to-talk (slash/button to arm) or always-listening behind the
  wake word.
