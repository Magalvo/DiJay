import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it } from "vitest";

import { backupDatabase } from "../../../src/infrastructure/sqlite/database-backup.js";
import { openAppDatabase } from "../../../src/infrastructure/sqlite/database.js";

describe("database backup", () => {
  const directory = mkdtempSync(join(tmpdir(), "dijay-backup-"));

  afterEach(() => {
    rmSync(directory, { force: true, recursive: true });
  });

  it("creates a consistent readable copy", async () => {
    const sourcePath = join(directory, "dijay.sqlite");
    const source = openAppDatabase(sourcePath);
    source.exec("INSERT INTO guild_settings VALUES ('guild-1', 80, 300, 1, '2026-01-01')");

    const targetPath = await backupDatabase(source, join(directory, "backups"));
    source.close();
    const copy = new DatabaseSync(targetPath, { readOnly: true });
    const row = copy
      .prepare("SELECT default_volume FROM guild_settings WHERE guild_id = ?")
      .get("guild-1") as unknown as { default_volume: number };
    copy.close();

    expect(existsSync(targetPath)).toBe(true);
    expect(row.default_volume).toBe(80);
  });
});
