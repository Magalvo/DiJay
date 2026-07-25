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

- [ ] Wake-word mode is behind its own flag (default off); push-to-talk `/listen` keeps working
      unchanged when the flag is off.
- [ ] While enabled, the listener stays connected to the voice channel and subscribes to
      per-user audio continuously, capturing one utterance at a time.
- [ ] An utterance is acted on only when it begins with the configured wake word; the wake word
      is stripped and the remainder is parsed and forwarded via the existing WI-013 IPC.
- [ ] Utterances without the wake word are discarded immediately; audio and non-command
      transcripts are never persisted and no transcript content is logged.
- [ ] Wake-word detection reuses the constrained Vosk grammar and `parseVoiceCommand`; no new
      native dependency is required for the initial version.
- [ ] A debounce/cooldown prevents the same utterance or rapid repeats from firing twice.
- [ ] User feedback works without a slash interaction (e.g. a short transient message or a
      reaction) and is not spammy.
- [ ] Recognition, silence, and IPC failures degrade without disconnecting or crashing the
      listener, and never affect the main bot or its playback.
- [ ] The CPU/privacy trade-off and the configurable wake word are documented.
- [ ] Red/Green/Refactor and all quality gates are recorded.

## Open Decisions

- **Wake word choice:** a word the model recognizes reliably (the current grammar omits
  "DiJay" as unlikely in the lexicon) vs a dedicated wake-word engine later.
- **Detection engine:** start with Vosk keyword-spotting (approach A, no new deps) and keep the
  door open for a dedicated always-on engine (openWakeWord / Porcupine) if accuracy is poor.
- **Feedback UX:** transient channel message vs message reaction vs none (the music changing is
  itself the feedback).
- **Activation scope:** any speaker in the channel vs an allowlist of users; per-user cooldown.
