# Work-Item: WI-015 - Soundboard Trigger Word

## Context

WI-014 gives hands-free control: the listener stays in the channel and acts on any utterance
that begins with the wake word `dj`. Members want a lighter, playful variant — hearing a plain
word (e.g. "gelado") should fire a specific Discord **soundboard** sound over the music, with no
`dj` prefix.

Because the listener sidecar already holds its own voice connection (a separate bot identity,
never Lavalink's) and stays in the channel for WI-014, it can send the sound through Discord's
**native soundboard** (`VoiceChannel.sendSoundboardSound`). The sound overlays the music as a
second audio stream — Lavalink and the music IPC are never touched. The sound already lives in
the server's soundboard; only its id is configured.

Unlike a command, a soundboard trigger is self-contained: the word itself is both the "wake" and
the action. It therefore bypasses the `dj` gate but stays inside hands-free mode (which is the
only always-listening path), so it is gated by `VOICE_WAKE_WORD_ENABLED`.

## Acceptance Criteria

- [x] Trigger words are recognized by the constrained Vosk grammar (the trigger is added to the
      grammar; a word absent from it can never be transcribed). No new native dependency.
- [x] Hearing a trigger word anywhere in an utterance fires the mapped sound with no wake word
      required; matching is on whole tokens so "congelado" does not fire "gelado".
- [x] The spoken trigger -> Discord sound id mapping is configuration
      (`VOICE_SOUNDBOARD_SOUNDS`, `key:soundId` pairs); no server-specific ids in code.
      Malformed entries fail fast at startup; empty disables the feature.
- [x] The sound is sent via Discord's native soundboard from the listener, overlaying the music;
      Lavalink and the WI-013 IPC path are untouched.
- [x] The listener joins unmuted (`selfMute: false`) because Discord rejects sending a soundboard
      sound from a self-muted client; listening is receive-side and unaffected.
- [x] An unconfigured trigger falls through to normal command handling instead of erroring;
      send failures (missing permission, muted, unavailable channel) are caught and logged and
      never disconnect the listener or affect playback.
- [x] Red/Green/Refactor and all quality gates are recorded.

## Resolved Decisions

- **Playback path:** Discord native soundboard sent by the listener (overlays the music), not a
  Lavalink track (would interrupt) and not a bundled file. Chosen with the requester.
- **Trigger word:** `gelado` — added to both language grammars and trigger lists.
- **Permission:** the listener bot needs `UseSoundboard` (and `Connect`/`Speak`) and must be
  unmuted; same-guild sounds need no `UseExternalSounds`.
- **Activation scope:** any non-bot speaker, reusing WI-014's auto-join and per-user cooldown.

## Implementation status

Code-complete and unit-tested for the testable surface (`matchSoundboardTrigger` per language,
the grammar entry, the `VOICE_SOUNDBOARD_SOUNDS` parsing). The native soundboard send in the
listener is validated via `typecheck:voice` / `build:voice`, like the rest of the receive
infrastructure, and needs live validation on the VPS with the second bot in a voice channel and
the sound id configured.
