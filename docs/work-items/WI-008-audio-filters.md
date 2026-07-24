# Work-Item: WI-008 - Audio Filters

## Context

Members want tone-shaping presets (bass boost, nightcore, 8D) that are common in modern
music bots. Lavalink v4 exposes audio filters natively through the Poru `player.filters`
API, so DiJay can offer presets without new audio infrastructure.

## Acceptance Criteria

- [ ] A `/filter` command applies named presets: `off`, `bassboost`, `nightcore`, `8d`,
      and `karaoke`.
- [ ] Presets are defined in the domain and translated to Lavalink filter payloads by an
      infrastructure adapter, keeping use cases free of the Poru SDK.
- [ ] Applying or clearing a filter is reflected in the live control panel.
- [ ] Filter controls enforce the same guild and voice-channel rules as other commands,
      and surface a localized `NOTHING_PLAYING` error when idle.
- [ ] Unknown or invalid presets return a localized validation error.
- [ ] Red/Green/Refactor and all quality gates are recorded.
