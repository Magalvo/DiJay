import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

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

  it("serves configured audio action files and blocks unsafe paths", async () => {
    const dir = await mkdtemp(join(tmpdir(), "dijay-audio-actions-"));
    await writeFile(join(dir, "greeting.mp3"), "clip", "utf8");
    await writeFile(join(dir, "secret.txt"), "secret", "utf8");
    const state = new HealthState();
    server = await startHealthServer(0, state, { audioActionsDir: dir });
    const baseUrl = `http://127.0.0.1:${server.port}`;

    const clip = await fetch(`${baseUrl}/audio-actions/greeting.mp3`);
    expect(clip.status).toBe(200);
    expect(await clip.text()).toBe("clip");

    expect((await fetch(`${baseUrl}/audio-actions/secret.txt`)).status).toBe(404);
    expect((await fetch(`${baseUrl}/audio-actions/../secret.txt`)).status).toBe(404);
  });
});
