# Work-Item: WI-018 - Audio Actions with Pre-Recorded Voice Clips

## 1. Context & Problem

DiJay can already react to slash commands and recognized speech, but all audible feedback is
either music playback or Discord soundboard triggers. Members want the bot to have its own
pre-recorded voice snippets for lightweight personality and guidance, starting with a greeting
when someone joins the voice channel where DiJay is already active.

## 2. Acceptance Criteria

- [x] Audio actions are opt-in via `AUDIO_ACTIONS_ENABLED`, disabled by default.
- [x] Clips are configured by a JSON manifest and served from `AUDIO_ACTIONS_DIR` under
      `/audio-actions/...`.
- [x] Manifest files must be relative `.mp3`, `.ogg`, or `.wav` paths; traversal and absolute
      paths are rejected.
- [x] A `voice_member_join` action fires only when a non-bot user enters or moves into the same
      voice channel as an existing DiJay Lavalink player.
- [x] The bot never joins voice only for a greeting; it uses the existing player and queues the
      clip next.
- [x] A per-guild/per-user/per-action cooldown prevents repeated greetings; default deployment
      uses 24 hours.
- [x] The configured text message is sent to the player's text channel when the clip is queued.
- [x] Clip failures, missing files, invalid manifests, or send-message failures do not affect
      music playback, voice recognition, or command handling.
- [x] Docker mounts `./audio-actions` read-only into the bot container; real clips are not
      committed.
- [x] Red/Green/Refactor and all quality gates are recorded.

## Implementation status

Code/config/docs complete for the repository surface. TDD record: config, manifest loader,
health-server file serving, audio action service, MusicService, and Poru gateway tests failed
first against missing WI-018 behavior, then passed after implementation. Quality gates passed:
`npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd test`, `npm.cmd run build`, and focused
Prettier checks for touched files.

Live VPS acceptance is still required with a real `audio-actions/greeting.mp3`: enable
`AUDIO_ACTIONS_ENABLED`, mount/create `actions.json`, rebuild the bot, enter the same voice
channel as an active DiJay player, and confirm the text greeting plus queued clip. Repeat with
the same user to confirm the cooldown.
