# Work-Spec: Implementation Plan for WI-020

## 1. Target Files

- **Production files:** `src/application/audio-actions/audio-action-manifest.ts`,
  `src/domain/voice/voice-command.ts`, `src/voice-listener/main.ts`,
  `src/voice-listener/voice-clip-player.ts`,
  `src/voice-listener/voice-listener-audio-actions.ts`,
  `docs/canonical/operations.md`, `.env.example`.
- **Test files:** `tests/unit/application/audio-action-manifest.test.ts`,
  `tests/unit/domain/voice-command.test.ts`,
  `tests/unit/voice-listener/voice-greeting-player.test.ts`,
  `tests/unit/voice-listener/voice-listener-audio-actions.test.ts`.

## 2. Proposed Technical Approach

Keep `audio-actions/actions.json` as the single recommended configuration source. The manifest
keeps the existing main-bot `voice_member_join` shape for WI-018 and adds voice-listener scoped
actions with `target: "voice_listener"`.

The sidecar owns local audio playback through a generic `VoiceClipPlayer`, which subscribes a
temporary `@discordjs/voice` audio player to the current DiJayMic connection. A
`VoiceListenerAudioActions` service filters manifest actions, resolves relative files against
`AUDIO_ACTIONS_DIR`, applies cooldown keys through the clip player, and exposes spoken phrases to
the Vosk constrained grammar.

On hands-free auto-join, DiJayMic attempts the first `voice_listener_join` action. If no such
manifest action exists, it falls back to the legacy `VOICE_GREETING_*` config. On each recognized
utterance, local `spoken_phrase` actions run before legacy Discord soundboard sounds and before
wake-command IPC forwarding. Failures are logged at the integration boundary and do not stop
listening.

## 3. Testing Strategy (TDD)

- **Red:** Manifest, grammar, clip-player, and sidecar audio-action tests fail against missing
  voice-listener manifest support and missing generic playback services.
- **Green:** Extend the manifest schema, add dynamic grammar words, introduce `VoiceClipPlayer`
  and `VoiceListenerAudioActions`, then wire the sidecar flow.
- **Refactor:** Run `typecheck`, `typecheck:voice`, `lint`, `test`, `build`, and `build:voice`;
  update the WI with the final gate result.
