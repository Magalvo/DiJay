# Work-Item: WI-002 - Private Lifecycle

## Context

DiJay must only operate in one private Discord server and must release voice resources
after an idle grace period.

## Acceptance Criteria

- [x] `DISCORD_GUILD_ID` is required and is enforced for commands, components, and guild joins.
- [x] Commands are registered only in the configured guild.
- [x] Queue end schedules a configurable idle timeout; new playback cancels it.
- [x] New players start with the configured or persisted default volume.
- [x] User-facing messages are valid UTF-8 Portuguese.
- [x] Red/Green/Refactor and all quality gates are recorded.
