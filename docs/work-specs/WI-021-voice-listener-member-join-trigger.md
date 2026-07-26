# Work-Spec: Implementation Plan for WI-021

## 1. Target Files

- **Production files:** `src/application/audio-actions/audio-action-manifest.ts`,
  `src/voice-listener/main.ts`, `src/voice-listener/voice-listener-audio-actions.ts`,
  `docs/canonical/operations.md`.
- **Test files:** `tests/unit/application/audio-action-manifest.test.ts`,
  `tests/unit/voice-listener/voice-listener-audio-actions.test.ts`.

## 2. Proposed Technical Approach

Extend the WI-020 manifest model with a third DiJayMic trigger,
`voice_listener_member_join`. The action shape stays intentionally close to
`voice_listener_join`: `id`, `target`, `trigger`, `file`, and `cooldownSeconds`.

`VoiceListenerAudioActions` exposes a new `handleListenerMemberJoin` method that finds the first
configured member-join action, resolves its relative file under `AUDIO_ACTIONS_DIR`, and asks the
shared `VoiceClipPlayer` to play it using a per-user cooldown key.

The hands-free sidecar already listens to `Events.VoiceStateUpdate` for reconciliation. The same
event handler can detect non-bot members entering or moving into the current connected channel and
fire the new action before continuing with the existing reconcile flow. The trigger only runs when
DiJayMic already has an active connection; the first human who causes DiJayMic to auto-join is
covered by the existing `voice_listener_join` trigger instead.

## 3. Testing Strategy (TDD)

- **Red:** Manifest tests expect `voice_listener_member_join` to parse, and sidecar service tests
  expect a per-user member join clip to play.
- **Green:** Add the manifest schema branch, service method, and `VoiceStateUpdate` wiring.
- **Refactor:** Run `typecheck`, `typecheck:voice`, `lint`, `test`, `build`, and `build:voice`;
  update the WI with the final gate result.
