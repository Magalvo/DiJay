# Work-Item: WI-014 - Hands-Free Wake-Word Listening

## Context

WI-013 gives voice commands via push-to-talk: a user runs `/listen` for every command. Users
want hands-free control — say a wake word and give the command without typing `/listen`.

Because the listener sidecar already holds its own dedicated voice connection (a separate bot
identity, never Lavalink's), it can **stay in the channel and listen continuously** without
disturbing playback, and it runs in its own process so continuous transcription never blocks
the main bot. A wake word gates every action, so the bot only acts on speech explicitly
addressed to it — nothing is acted on otherwise. This extends WI-013 and reuses the same
authenticated IPC path to the main bot; the main bot is unchanged.

Continuous listening is a real privacy and CPU trade-off (the listener transcribes speech in
the channel to spot the wake word), so it is strictly opt-in and off by default; push-to-talk
`/listen` remains the default, lower-footprint mode.

## Acceptance Criteria

- [x] Wake-word mode is behind its own flag (`VOICE_WAKE_WORD_ENABLED`, default off);
      push-to-talk `/listen` keeps working unchanged when the flag is off.
- [x] While enabled, the listener stays connected to the voice channel and subscribes to
      per-user audio continuously (via `receiver.speaking`), capturing one utterance at a time.
- [x] An utterance is acted on only when it begins with the wake word (`parseWakeCommand`); the
      wake word is stripped and the transcript is forwarded via the existing WI-013 IPC.
- [x] Utterances without the wake word are discarded immediately; audio and non-command
      transcripts are never persisted and no transcript content is logged.
- [x] Wake-word detection reuses the constrained Vosk grammar and parser; no new native
      dependency is required (approach A).
- [x] A per-user cooldown prevents the same utterance or rapid repeats from firing twice.
- [x] Feedback: the executed action itself is the feedback — the listener holds only
      View/Connect (no SendMessages) and has no interaction, so it logs the outcome rather than
      posting, avoiding channel spam.
- [x] Recognition, silence, and IPC failures are caught per capture and never disconnect the
      listener or affect the main bot or its playback.
- [x] The CPU/privacy trade-off and the wake word are documented (`.env.example`, README-level).
- [x] Red/Green/Refactor and all quality gates are recorded.

## Resolved Decisions

- **Wake word:** `dj` — already in both language vocabularies and recognizable by the model,
  so no custom training. (Detection stays approach A.)
- **Detection engine:** Vosk keyword-spotting; a dedicated engine (openWakeWord / Porcupine)
  remains a future option if accuracy proves insufficient.
- **Feedback UX:** none posted — the music action is the feedback (the listener lacks
  SendMessages and has no interaction to reply to).
- **Activation scope:** any non-bot speaker in the channel; the listener auto-joins the channel
  that has people and leaves when it empties, with a per-user cooldown.

## Implementation status

Code-complete and unit-tested for the testable surface (`parseWakeCommand` per language, the
config flag). The continuous-receive orchestration in the listener is validated via
`typecheck:voice` / `build:voice`, like the rest of the receive infrastructure, and needs live
validation on the VPS with the second bot in a voice channel.
