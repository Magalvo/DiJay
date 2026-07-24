import "dotenv/config";

import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { parseEnv } from "../../config/env.js";
import { backupDatabase } from "./database-backup.js";

const config = parseEnv(process.env);
const sourcePath = join(config.dataDir, "dijay.sqlite");
const backupDirectory = join(config.dataDir, "backups");
const database = new DatabaseSync(sourcePath, { readOnly: true });

try {
  const targetPath = await backupDatabase(database, backupDirectory);
  console.log(`Backup created: ${targetPath}`);
} finally {
  database.close();
}
