# Work-Spec: WI-008 - Audio Filters

## Target Files

- **Production files:** `src/domain/music/filter.ts` (new),
  `src/application/music/music-gateway.ts`, `src/application/music/music-service.ts`,
  `src/infrastructure/lavalink/poru-music-gateway.ts`,
  `src/presentation/discord/command-data.ts`, `src/presentation/discord/commands.ts`,
  `src/presentation/discord/command-registry.ts` (error copy)
- **Test files:** `tests/unit/application/music-service.test.ts`,
  `tests/unit/infrastructure/poru-music-gateway.test.ts`

## Approach

Model a closed `AudioFilterPreset` union in the domain and add a `setFilter` method to the
`MusicGateway` port. The Poru adapter maps each preset to concrete equalizer/timescale/
rotation payloads. `MusicService.setFilter` validates the preset and reuses the existing
nothing-playing/authorization guards. The presentation layer adds a `/filter` choice
command and refreshes the live panel afterwards.

## TDD

- **Red:** A service test asserts an unknown preset throws a validation error and a known
  preset delegates to the gateway.
- **Green:** Implement the preset map and gateway call.
- **Refactor:** Extract the payload table, confirm the domain stays SDK-free, and run all
  gates.
