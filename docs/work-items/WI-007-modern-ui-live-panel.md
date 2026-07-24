# Work-Item: WI-007 - Modern UI, Autocomplete, and Live Panel

## Context

The presentation layer lagged behind current Discord bots: plain-text replies, no track
artwork, no search autocomplete, and a control panel that only refreshed on a manual
button. An audit prioritized visual and interaction upgrades that keep the clean
architecture intact. This item records the work shipped in PR #1 and absorbs the audit's
"flags/Portuguese formatter" clean-up.

## Acceptance Criteria

- [x] `Track` carries `artworkUrl`/`sourceName`, mapped from Lavalink v4.
- [x] A shared embed factory renders `/play`, `/queue`, `/nowplaying`, `/help`, and the
      control panel with brand colour, thumbnail, footer, and timestamp.
- [x] `/play` offers live search autocomplete backed by the resolve gateway, failing
      closed to an empty list on error.
- [x] A per-guild live control panel refreshes on `trackStart`, `queueEnd`,
      `playerDestroy`, and mutating commands/buttons without a polling timer.
- [x] Deprecated `ephemeral` is replaced by `MessageFlags.Ephemeral`; remaining formatter
      strings are Portuguese.
- [x] Red/Green/Refactor and all quality gates are recorded (36 tests, format, lint,
      typecheck, build).
