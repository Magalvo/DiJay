# Work-Spec: WI-007 - Modern UI, Autocomplete, and Live Panel

## Target Files

- **Production files:** `src/domain/music/track.ts`,
  `src/infrastructure/lavalink/poru-music-gateway.ts`,
  `src/presentation/discord/embeds.ts` (new), `src/presentation/discord/live-panel.ts`
  (new), `src/presentation/discord/control-panel.ts`,
  `src/presentation/discord/commands.ts`, `src/presentation/discord/command.ts`,
  `src/presentation/discord/command-registry.ts`, `src/presentation/discord/command-data.ts`,
  `src/presentation/discord/music-buttons.ts`, `src/presentation/discord/music-formatters.ts`,
  `src/bootstrap.ts`
- **Test files:** `tests/unit/presentation/live-panel.test.ts` (new),
  `tests/unit/presentation/music-formatters.test.ts`

## Approach

Extend the domain `Track` with optional artwork/source metadata and map it in the Poru
adapter, keeping use cases SDK-free. Centralize embed construction in an `embeds` module
consumed by commands and the control panel. Add an autocomplete path to the command
contract and registry, wired from `InteractionCreate`. Introduce a `LivePanelManager`
that stores one panel message reference per guild and re-renders it from `MusicService`
state on Lavalink events and mutating interactions, avoiding a polling timer to respect
rate limits.

## TDD

- **Red:** A live-panel test expects the registered message to be edited from the current
  state; the queue formatter test expects Portuguese output.
- **Green:** Implement the manager and translated formatter to satisfy the behaviours.
- **Refactor:** Deduplicate progress/loop helpers, switch to `MessageFlags.Ephemeral` and
  `withResponse`, and run all gates.

## Execution Record

- **Red:** New live-panel and translated-formatter tests failed before implementation.
- **Green:** Embeds, autocomplete, and the self-updating panel satisfied every assertion.
- **Refactor:** 36 tests plus format, lint, typecheck, and build gates passed; shipped in
  PR #1 and merged to `main`.
