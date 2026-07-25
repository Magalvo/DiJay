# Work-Item: WI-013 - Voice Command Sidecar (Dedicated Listener Bot)

## Context

WI-012 delivered opt-in voice commands, but the recognition runs inside the main bot and
has two structural limits documented as experimental:

1. **Voice-connection takeover.** Discord grants a bot a single voice connection per guild.
   Lavalink holds that connection (out of process) to send audio, so joining with
   `@discordjs/voice` to _receive_ audio hijacks it and interrupts playback. There is no way
   for one bot to play through Lavalink and listen at the same time in the same guild.
2. **Event-loop blocking.** Vosk transcription is a synchronous native (FFI) call on the
   main thread, so it stalls the whole bot (gateway heartbeats, every guild's interactions)
   for the duration of the transcription.

A **dedicated listener process with its own Discord bot identity** removes both limits: a
second bot gets its own voice connection (Lavalink is never touched), and running in a
separate process keeps all STT work off the main bot's event loop. The listener transcribes
in memory and forwards the recognized command to the main bot over the private network; the
main bot executes it through the existing `VoiceCommandService`/`MusicService`, so the domain
logic is reused unchanged. This supersedes the in-process `/listen` path from WI-012.

## Acceptance Criteria

- [ ] A separate listener service runs with its own bot token and joins voice only to
      receive per-user audio; playback via Lavalink on the main bot is never interrupted.
- [ ] All STT work happens in the listener process; the main bot's event loop is never
      blocked by transcription.
- [ ] The listener decodes Opus to PCM and transcribes in memory only, reusing the existing
      Vosk adapter and the shared `parseVoiceCommand` grammar; audio is discarded immediately.
- [ ] Recognized commands are forwarded to the main bot over an internal endpoint on the
      private Docker network (never published) and dispatched through `VoiceCommandService`,
      reusing its existing guards and error handling.
- [ ] The internal endpoint authenticates every request with a shared secret, re-applies the
      single-guild allowlist, and verifies the requester is in the bot's voice channel before
      acting; no unauthenticated or cross-guild caller can drive playback.
- [ ] Nothing is persisted and no transcript content is logged (privacy parity with WI-012).
- [ ] The feature is opt-in and disabled by default, ships as a separate Compose service, and
      the setup, security model, and second-bot/ToS caveat are documented.
- [ ] Permission, silence-timeout, and recognition failures degrade in the listener without
      affecting the main bot or its playback.
- [ ] Red/Green/Refactor and all quality gates are recorded.

## Open Decisions

- **IPC transport:** authenticated HTTP POST on the private network vs a lightweight queue.
- **Payload:** the listener forwards a raw transcript (main bot parses) vs a pre-parsed
  intent (main bot only validates and dispatches).
- **Trigger:** push-to-talk handshake (a command on the main bot arms the listener for one
  utterance) vs the listener always sitting in the channel behind a wake word.
- **Feedback channel:** how the outcome reaches the user (ephemeral reply from the main bot on
  the original interaction vs a message from the listener).
- **Second identity cost:** a second bot appears as a member in the channel, and Discord voice
  _receive_ remains officially unsupported — confirm this is acceptable for a private server.
