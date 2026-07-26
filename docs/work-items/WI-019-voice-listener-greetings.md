# Work-Item: WI-019 - DiJayMic Voice Greetings

## 1. Context & Problem

WI-018 lets the main DiJay bot queue greeting clips through Lavalink, but in the current live
setup the bot that joins automatically is DiJayMic, the voice-listener sidecar. When a user joins
an idle voice channel, only DiJayMic appears, so the main bot has no Lavalink player and cannot
play the greeting.

## 2. Acceptance Criteria

- [x] DiJayMic can play a configured local greeting clip after it auto-joins a voice channel for
      hands-free listening.
- [x] The greeting is opt-in via `VOICE_GREETING_ENABLED`, disabled by default.
- [x] The greeting uses `VOICE_GREETING_FILE` and the existing `./audio-actions` read-only mount.
- [x] A per-channel cooldown prevents repeated greetings; default is 24 hours.
- [x] Greeting failures are logged and do not stop wake-word listening, soundboard triggers, or
      IPC command forwarding.
- [x] Red/Green/Refactor and all quality gates are recorded.

## Implementation status

Code/config/docs complete for the repository surface. TDD record: config and
`VoiceGreetingPlayer` tests failed first against missing WI-019 behavior, then passed after
implementation. Quality gates passed: `npm.cmd run typecheck`, `npm.cmd run typecheck:voice`,
`npm.cmd run lint`, `npm.cmd test`, `npm.cmd run build`, and `npm.cmd run build:voice`.

Live VPS acceptance is still required with a real `audio-actions/greeting.mp3`: enable
`VOICE_WAKE_WORD_ENABLED=true`, `VOICE_GREETING_ENABLED=true`, set `VOICE_GREETING_FILE`, rebuild
the voice-listener sidecar, and confirm DiJayMic plays the clip after auto-joining.
