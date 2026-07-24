import "dotenv/config";

import { startBot } from "./bootstrap.js";
import { parseEnv } from "./config/env.js";

void startBot(parseEnv(process.env)).catch((error: unknown) => {
  console.error("DiJay failed to start.", error);
  process.exitCode = 1;
});
