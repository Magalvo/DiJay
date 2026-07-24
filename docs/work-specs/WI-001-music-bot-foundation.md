# Work-Spec: Implementation Plan for WI-001

## 1. Target Files

- **Production:** `src/domain/music/*`, `src/application/music/*`,
  `src/infrastructure/lavalink/*`, `src/presentation/discord/*`, `src/config/*`,
  `src/bootstrap.ts`, `src/main.ts`
- **Tests:** `tests/unit/application/*`, `tests/unit/config/*`,
  `tests/unit/presentation/*`
- **Operations:** `compose.yml`, `lavalink/application.yml`, `.env.example`, `README.md`

## 2. Proposed Technical Approach

Use a ports-and-adapters layout:

1. Domain types describe tracks, queues, and stable music errors.
2. `MusicService` owns validation and use-case orchestration against a `MusicGateway`
   interface.
3. `PoruMusicGateway` is the only module aware of Poru/Lavalink.
4. Discord slash-command modules translate interactions into application requests and
   user-safe replies.
5. A composition root wires configuration, logging, Discord, and Lavalink.

Lavalink v4 runs separately so media decoding and voice transport cannot block the bot's
Node.js event loop. The YouTube source is an optional Lavalink plugin; other Lavalink
sources remain available without changing application code.

## 3. Testing Strategy (TDD)

- **Red:** Tests import missing application/config/presentation modules and define their
  contracts before production code exists.
- **Green:** Add the smallest domain, service, formatting, and configuration code that
  satisfies those tests.
- **Refactor:** Add the Poru and Discord adapters, then run the full typecheck, lint,
  test, formatting, and build gates.
- **Input:** Queries, guild/channel/requester IDs, fake gateway results, environment maps,
  and queue snapshots.
- **Expected behavior:** Trimmed and validated requests, stable error codes, bounded
  queue text, validated secrets/endpoints, and no infrastructure types crossing the
  application boundary.
