# DiJay Architecture

DiJay is a modular monolith organized around feature slices and dependency direction:

`presentation -> application -> domain`

Infrastructure implements application ports and is wired only in the composition root.
Feature code must not import from another feature's infrastructure package.

## Decisions

- Discord interactions are the initial presentation adapter.
- Lavalink v4 is the initial music transport and decoding process.
- Poru is isolated inside `src/infrastructure/lavalink`.
- Configuration is parsed once at startup and passed as typed data.
- Logs are structured; user-facing replies never expose internal exceptions.
- Lavalink playback queues remain in memory; durable shared playlists and guild settings
  use a single SQLite database through application repository ports.
- The bot is private to one configured Discord guild.
- Runtime health requires both Discord and the single Lavalink node.
- One Dockerized bot instance and one Lavalink node are the supported deployment topology.

## Adding a feature

Add its domain model, application use cases/ports, one or more adapters, tests, and a
command module. Register the module in the composition root; do not expand a central
switch statement.
