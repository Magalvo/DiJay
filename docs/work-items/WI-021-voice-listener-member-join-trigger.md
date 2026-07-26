# Work-Item: WI-021 - DiJayMic Member Join Audio Trigger

## 1. Context & Problem

WI-020 lets DiJayMic play local clips from `audio-actions/actions.json` when it auto-joins a voice
channel or hears configured spoken phrases. A server greeting, however, often needs to fire when a
new human joins the voice channel where DiJayMic is already listening, not only when DiJayMic
connects.

## 2. Acceptance Criteria

- [x] The shared manifest accepts `target: "voice_listener"` with
      `trigger: "voice_listener_member_join"`.
- [x] DiJayMic plays the first configured member-join clip when a non-bot member enters or moves
      into the channel where DiJayMic is already connected.
- [x] The cooldown key is scoped by `guildId:channelId:userId:actionId`, allowing per-user
      greetings.
- [x] The trigger does not fire for bot users, channel leaves, or users joining another channel.
- [x] Member-join clip failures are logged and do not stop wake-word listening, soundboard
      triggers, or IPC.
- [x] Red/Green/Refactor and all quality gates are recorded.

## Implementation Status

Code/docs complete for the repository surface. TDD record: manifest and
`VoiceListenerAudioActions` tests failed first against missing WI-021 behavior, then passed after
implementation. Quality gates passed: `npm.cmd run typecheck`, `npm.cmd run typecheck:voice`,
`npm.cmd run lint`, `npm.cmd test`, `npm.cmd run build`, and `npm.cmd run build:voice`.

Live VPS acceptance is still required with a real `voice_listener_member_join` action in
`audio-actions/actions.json`: rebuild/recreate `voice-listener`, keep DiJayMic connected, and
confirm the clip plays when another non-bot member joins that channel.
