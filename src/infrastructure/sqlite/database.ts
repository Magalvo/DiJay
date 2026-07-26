import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

const migrations = [
  {
    version: 1,
    sql: `
      CREATE TABLE guild_settings (
        guild_id TEXT PRIMARY KEY,
        default_volume INTEGER NOT NULL CHECK(default_volume BETWEEN 0 AND 150),
        idle_timeout_seconds INTEGER NOT NULL CHECK(idle_timeout_seconds BETWEEN 30 AND 3600),
        announcements_enabled INTEGER NOT NULL CHECK(announcements_enabled IN (0, 1)),
        updated_at TEXT NOT NULL
      );

      CREATE TABLE playlists (
        id INTEGER PRIMARY KEY,
        guild_id TEXT NOT NULL,
        normalized_name TEXT NOT NULL,
        display_name TEXT NOT NULL,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(guild_id, normalized_name)
      );

      CREATE TABLE playlist_tracks (
        id INTEGER PRIMARY KEY,
        playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
        position INTEGER NOT NULL CHECK(position > 0),
        title TEXT NOT NULL,
        author TEXT NOT NULL,
        source_uri TEXT,
        duration_ms INTEGER NOT NULL CHECK(duration_ms >= 0),
        is_stream INTEGER NOT NULL CHECK(is_stream IN (0, 1)),
        UNIQUE(playlist_id, position)
      );
    `,
  },
  {
    version: 2,
    sql: `
      ALTER TABLE guild_settings
        ADD COLUMN voice_language TEXT NOT NULL DEFAULT 'pt'
        CHECK(voice_language IN ('pt', 'en'));
    `,
  },
] as const;

export function openAppDatabase(path: string): DatabaseSync {
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }
  const database = new DatabaseSync(path);
  database.exec("PRAGMA foreign_keys = ON");
  database.exec("PRAGMA journal_mode = WAL");
  database.exec("PRAGMA busy_timeout = 5000");
  migrateDatabase(database);
  return database;
}

export function migrateDatabase(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `);
  const appliedRows = database.prepare("SELECT version FROM schema_migrations").all() as Array<{
    version: number;
  }>;
  const applied = new Set(appliedRows.map(({ version }) => version));

  for (const migration of migrations) {
    if (applied.has(migration.version)) {
      continue;
    }
    withTransaction(database, () => {
      database.exec(migration.sql);
      database
        .prepare("INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)")
        .run(migration.version, new Date().toISOString());
    });
  }
}

export function withTransaction<T>(database: DatabaseSync, callback: () => T): T {
  database.exec("BEGIN IMMEDIATE");
  try {
    const result = callback();
    database.exec("COMMIT");
    return result;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}
