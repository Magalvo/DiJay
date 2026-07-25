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

- [x] A separate listener service runs with its own bot token and joins voice only to
      receive per-user audio; playback via Lavalink on the main bot is never interrupted.
      (`src/voice-listener/main.ts`; distinct token/identity, never touches Lavalink.)
- [x] All STT work happens in the listener process; the main bot's event loop is never
      blocked by transcription.
- [x] The listener decodes Opus to PCM and transcribes in memory only, reusing the existing
      Vosk adapter and the shared `parseVoiceCommand` grammar; audio is discarded immediately.
- [x] Recognized commands are forwarded to the main bot over an internal endpoint on the
      private Docker network (never published) and dispatched through `VoiceCommandService`,
      reusing its existing guards and error handling.
- [x] The internal endpoint authenticates every request with a constant-time shared-secret
      check, re-applies the single-guild allowlist, and derives the requester's voice channel
      from the main bot's own cache before acting; no unauthenticated or cross-guild caller can
      drive playback.
- [x] Nothing is persisted and no transcript content is logged (privacy parity with WI-012).
- [x] The feature is opt-in and disabled by default, ships as a separate Compose service, and
      the setup, security model, and second-bot/ToS caveat are documented.
- [x] Permission, silence-timeout, and recognition failures degrade in the listener without
      affecting the main bot or its playback.
- [x] Red/Green/Refactor and all quality gates are recorded.

## Implementation status

Code-complete and covered by unit tests (config, IPC server auth/allowlist/dispatch, IPC
client contract); `typecheck`, `typecheck:voice`, `lint`, `build`, and `build:voice` are green.
The one step that cannot be exercised in CI is the **live two-bot voice flow** (a real second
bot receiving audio and the end-to-end capture → transcribe → forward → play path); this must
be validated on the VPS with the second application configured.

## Resolved Decisions

- **Deployment:** the listener runs on the **same VPS**, as an extra Compose service on the
  private `dijay-private` network, from the same repository/image (`Dockerfile.voice`) with a
  distinct entry point. It reuses the mounted Vosk model.
- **Second identity:** a **new Discord application/bot token** (`VOICE_BOT_TOKEN`) is required
  and invited to the same guild with minimal permissions (View Channel + Connect; no Speak).
  It appears as a second member. Voice _receive_ remains officially unsupported by Discord —
  accepted for a private server.
- **IPC transport:** authenticated **HTTP POST** on the private network (matches the existing
  `node:http` health-server style; no extra broker).
- **Payload:** the listener forwards the **raw transcript**; the main bot runs
  `parseVoiceCommand` and dispatches, keeping the grammar and authority in one place.
- **Trigger:** **push-to-talk** — the listener registers its own `/listen` command and
  captures a single utterance, so nothing is transcribed continuously.
- **Feedback channel:** the **listener replies to its own interaction** with the outcome
  message returned by the main bot, so no cross-bot interaction editing is needed.
- **Voice-channel authority:** the main bot never trusts the channel from the payload; it
  derives the requester's voice channel from its own `GuildVoiceStates` cache before acting.

## Open Decisions

- Whether the listener is later extracted into its own package (kept in this repo for now).
- Whether to add an always-listening wake-word mode behind a separate flag in a follow-up.
