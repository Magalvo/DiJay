import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { backup, type DatabaseSync } from "node:sqlite";

export async function backupDatabase(
  database: DatabaseSync,
  backupDirectory: string,
  now = new Date(),
): Promise<string> {
  mkdirSync(backupDirectory, { recursive: true });
  const timestamp = now.toISOString().replaceAll(":", "-");
  const targetPath = join(backupDirectory, `dijay-${timestamp}.sqlite`);
  await backup(database, targetPath);
  return targetPath;
}
