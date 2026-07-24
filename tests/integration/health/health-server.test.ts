import { afterEach, describe, expect, it } from "vitest";

import { HealthState } from "../../../src/infrastructure/health/health-state.js";
import {
  startHealthServer,
  type HealthServer,
} from "../../../src/infrastructure/health/health-server.js";

describe("health server", () => {
  let server: HealthServer | undefined;

  afterEach(async () => {
    await server?.close();
  });

  it("returns 503 while degraded and 200 when all dependencies are ready", async () => {
    const state = new HealthState();
    server = await startHealthServer(0, state);
    const url = `http://127.0.0.1:${server.port}/health`;

    expect((await fetch(url)).status).toBe(503);

    state.setDiscordReady(true);
    state.setLavalinkReady(true);
    const response = await fetch(url);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      healthy: true,
      status: "ready",
    });
  });
});
