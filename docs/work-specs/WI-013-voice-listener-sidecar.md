# Work-Spec: Implementation Plan for WI-013

## 1. Target Files

- **Production files:**
  - `src/voice-listener/main.ts` (new) — entry point for the listener process: logs in with
    the second bot token, arms/captures via the existing receiver, transcribes, forwards.
  - `src/infrastructure/voice/discord-voice-listener.ts`, `vosk-speech-to-text.ts`,
    `src/domain/voice/voice-command.ts` (reused as-is — capture, STT, and grammar are
    provider- and process-agnostic already).
  - `src/infrastructure/voice/intent-forwarder.ts` (new) — HTTP client that POSTs the
    recognized intent to the main bot with the shared-secret header.
  - `src/infrastructure/ipc/voice-command-server.ts` (new, main bot) — small authenticated
    HTTP endpoint that validates the secret, allowlist, and voice-channel membership, then
    dispatches through `VoiceCommandService`.
  - `src/config/env.ts` — new optional `VOICE_BOT_TOKEN`, `VOICE_IPC_SECRET`,
    `VOICE_IPC_URL`/`VOICE_IPC_PORT`; the main bot exposes `spotify`-style `voiceIpc`
    config; the listener reuses the same schema.
  - `src/bootstrap.ts` — start the command server when `VOICE_IPC_SECRET` is set.
  - `compose.voice.yml` — add a `voice-listener` service on the private network; `Dockerfile.voice`
    already builds the voice-enabled image and is reused.
- **Test files:**
  - `tests/unit/infrastructure/voice-command-server.test.ts` (new) — rejects missing/incorrect
    secret and disallowed guilds; dispatches a valid intent to a mocked `VoiceCommandService`.
  - `tests/unit/infrastructure/intent-forwarder.test.ts` (new) — attaches the secret header and
    serializes the intent payload; surfaces transport failures without throwing into capture.
  - `tests/unit/domain/voice-command.test.ts`, `tests/unit/application/voice-command-service.test.ts`
    (existing) — unchanged; the reused domain/service keep their coverage.

## 2. Proposed Technical Approach

Split recognition from the main bot along a process boundary. The **listener** is a second
Node process that logs in with its own bot token and uses `@discordjs/voice` purely to
receive. Because it is a distinct bot identity, it holds its own voice connection and never
contends with Lavalink, so the main bot keeps playing. On a capture trigger it decodes one
per-user utterance to PCM, runs Vosk (its own event loop, so blocking is contained to the
listener), parses the transcript with the shared `parseVoiceCommand` grammar, and forwards
the resulting intent.

The **main bot** exposes a narrow, authenticated HTTP endpoint on the private Docker network
(not published). It authenticates the shared secret in constant time, re-applies the
`GuildAccessPolicy` allowlist, verifies the requester is currently in the bot's voice channel
(via the `GuildVoiceStates` cache, mirroring `playbackRequestFromInteraction`), builds a
`PlaybackRequest`, and dispatches through the existing `VoiceCommandService`. No new playback
logic is introduced; the IPC layer is just another adapter driving the same application port.

Trade-offs to settle during implementation: the endpoint is the sensitive surface, so it must
never trust `guildId`/`voiceChannelId` from the payload without re-verifying membership, and
it must stay bound to the internal network with the secret as the primary gate. Push-to-talk
(main bot arms the listener for one utterance) keeps the privacy posture of WI-012 and avoids
always-on transcription; the arming handshake is the main new coordination to design.

## 3. Testing Strategy (TDD)

- **Red:** A `voice-command-server` test asserts that a request without the correct secret is
  rejected (401), a request for a non-allowlisted guild is refused, and a valid signed intent
  calls `VoiceCommandService.handle` with a `PlaybackRequest` derived from the verified member.
  An `intent-forwarder` test asserts the secret header and JSON body, and that a transport
  error is reported rather than thrown into the capture path.
- **Green:** Implement the authenticated endpoint and the forwarder client against a mocked
  `VoiceCommandService` and a stubbed HTTP layer; wire the listener entry point.
- **Refactor:** Keep the domain and application layers unaware of IPC, reuse the WI-012 STT
  and grammar without change, document the two-bot setup, secret handling, network isolation,
  and the voice-receive ToS caveat, then run typecheck (main + voice), lint, tests, and build.

## Open Decisions

- HTTP vs a queue for IPC, and whether the arming handshake is a second reverse call to the
  listener or a persistent listener that the main bot signals.
- Raw transcript vs pre-parsed intent on the wire (affects whether the grammar runs in the
  listener or the main bot).
- Whether the listener shares this repository/image (single codebase, two entry points) or is
  extracted into its own package later.
