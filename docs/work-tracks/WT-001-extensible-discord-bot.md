# Work Track: WT-001 - Extensible Discord Bot

## Vision

Build DiJay as a reliable music-first Discord bot whose capabilities can expand without
turning command handling, business rules, and third-party SDKs into one coupled module.

## Delivered

**Foundation**

1. **WI-001 — Music bot foundation:** slash commands, queue controls, Lavalink adapter,
   validated configuration, CI, and local operations.
2. **WI-002 — Private lifecycle:** single-guild allowlist, idle lifecycle, and safe defaults.
3. **WI-003 — Advanced playback:** volume, seek, loop, queue operations, and controls panel.
4. **WI-004 — Shared playlists:** SQLite settings, shared playlists, and backups.
5. **WI-005 — VPS deployment:** production containers, healthchecks, and operations.
6. **WI-006 — Bot presence:** configurable activity and hardened Lavalink deployment.
7. **WI-007 — Modern UI & live panel:** rich embeds, artwork, `/play` autocomplete, and a
   self-updating control panel.

**Sources**

8. **WI-011 — Spotify import & playback:** LavaSrc-backed Spotify URLs and playlist import.
9. **WI-017 — Spotify metadata without a Premium owner account:** anonymous-token sidecar
   replacing the Client Credentials flow. _(Runtime validation criteria still open.)_

**Voice**

10. **WI-012 — Voice command recognition:** opt-in offline speech-to-text (Vosk) with a
    bounded command grammar, via push-to-talk `/listen`.
11. **WI-013 — Voice command sidecar:** recognition moved to a dedicated listener process
    with its own Discord identity, so receiving audio no longer hijacks Lavalink's voice
    connection. Commands reach the main bot over an authenticated internal HTTP endpoint.
12. **WI-014 — Hands-free wake-word listening:** continuous listening behind the `dj` wake
    word, without `/listen`.
13. **WI-015 — Soundboard trigger word:** plain words fire a Discord soundboard sound, with
    no wake-word prefix.
14. **WI-016 — Runtime voice language toggle:** PT/EN switched from Discord via
    `/settings voice-language`, without a restart.
15. **WI-018 — Audio actions:** pre-recorded local voice clips as triggerable actions.
16. **WI-019 — Voice greetings:** the listener greets on joining a voice channel.
17. **WI-020 — Local audio triggers:** trigger words mapped to local clips.
18. **WI-021 — Member join trigger:** audio fired when a member joins.

**Reliability**

19. **Self-heal watchdog:** supervises the bot and voice-listener processes.

## Backlog

- **WI-008 — Audio filters:** bassboost/nightcore/8D presets via Lavalink filters.
- **WI-009 — Queue pagination & extended controls:** paged `/queue` and previous/volume
  buttons backed by a playback-history buffer.
- **WI-010 — Components V2 panel:** image-forward control panel using Discord Components V2.

## Known operational debt

YouTube playback depends on a chain that upstream keeps breaking: the plugin is pinned to a
main-branch snapshot rather than a release, authenticated playback needs an OAuth refresh
token from a burner Google account, and deciphering is delegated to the `yt-cipher` sidecar.
Spotify metadata uses an anonymous token endpoint that is outside Spotify's Terms of Service.
Each decision is documented inline in `lavalink/application.yml` and in
`docs/canonical/operations.md`; revisit whenever a release ships the relevant fix.

Every future item must define acceptance criteria and failing tests before implementation.
