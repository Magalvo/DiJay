# Work-Spec: WI-004 - SQLite Settings and Shared Playlists

## Approach

Define repository ports in the application layer and implement them with `node:sqlite`.
Run numbered migrations at startup. Store durable track metadata and source URI, not
Lavalink encoded payloads.

## TDD

- **Red:** Temporary-database migration, CRUD, constraints, ordering, and service tests fail.
- **Green:** Implement the database wrapper, repositories, services, and slash subcommands.
- **Refactor:** Use transactions for ordering changes and close SQLite during shutdown.

## Execution Record

- **Red:** Repository imports, migrations, constraints, and backup contract failed.
- **Green:** Temporary-database CRUD, partial playback, ordering, and backup tests passed.
- **Refactor:** Repository ports isolate SQLite and ordering changes use transactions.
