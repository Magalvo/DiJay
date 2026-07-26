# Work-Item: WI-020 - DiJayMic Local Audio Triggers

## 1. Context & Problem

WI-018 introduced manifest-driven audio actions for the main DiJay bot through Lavalink, and
WI-019 added a separate DiJayMic greeting path through `VOICE_GREETING_*`. That split makes each
new local sound require either a new env var or a second configuration model.

DiJayMic should use the shared `audio-actions/actions.json` manifest for local clips it plays
through its own voice connection, including greetings and spoken phrase triggers.

## 2. Acceptance Criteria

- [x] The shared audio-actions manifest accepts `target: "voice_listener"` actions.
- [x] DiJayMic can play the first configured `voice_listener_join` clip after auto-joining.
- [x] DiJayMic can play a configured `spoken_phrase` clip when a normalized transcript matches
      a whole phrase/token.
- [x] Spoken phrase manifest entries extend the Vosk grammar for the selected language.
- [x] Local clip actions are evaluated before legacy Discord soundboard triggers and wake
      commands.
- [x] `VOICE_GREETING_*` remains supported as a legacy fallback when no manifest join action is
      configured.
- [x] Invalid clip paths/extensions and spoken phrase actions without phrases are rejected.
- [x] Red/Green/Refactor and all quality gates are recorded.

## Implementation Status

Code/config/docs complete for the repository surface. TDD record: manifest, grammar,
`VoiceClipPlayer`, and `VoiceListenerAudioActions` tests failed first against missing WI-020
behavior, then passed after implementation. Quality gates passed: `npm.cmd run typecheck`,
`npm.cmd run typecheck:voice`, `npm.cmd run lint`, `npm.cmd test`, `npm.cmd run build`, and
`npm.cmd run build:voice`.

Live VPS acceptance is still required with real clips in `audio-actions/`: enable
`AUDIO_ACTIONS_ENABLED=true`, configure `actions.json`, rebuild `bot` and `voice-listener`, then
confirm DiJayMic plays `voice_listener_join` and `spoken_phrase` clips while wake-word commands
and legacy soundboard triggers still work.
