import { mkdtemp, writeFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import { HealthState } from "../../../src/infrastructure/health/health-state.js";
import {
  startHealthServer,
  type HealthServer,
} from "../../../src/infrastructure/health/health-server.js";

/**
 * Sends a GET with the exact request-target given, bypassing WHATWG URL normalization.
 * `fetch()` resolves `..` segments client-side before the request ever reaches the wire (e.g.
 * `/audio-actions/../secret.txt` is sent as plain `/secret.txt`), so it cannot exercise the
 * server's own traversal defense — only `http.request`'s raw `path` option can.
 */
function rawGet(port: number, rawPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { host: "127.0.0.1", method: "GET", path: rawPath, port },
      (response) => {
        response.resume();
        response.on("end", () => resolve(response.statusCode ?? 0));
      },
    );
    req.on("error", reject);
    req.end();
  });
}

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

    // fetch() itself resolves ".." client-side before sending the request (confirmed: it hits
    // the wire as plain "/secret.txt"), so it can only prove out-of-prefix requests 404 — not
    // that the server's own traversal guard works. rawGet sends the exact bytes a client that
    // does not normalize (curl, a raw socket) could send, actually exercising `isSafeAudioPath`
    // and the resolve()+startsWith() containment check in serveAudioAction.
    expect(await rawGet(server.port, "/audio-actions/../secret.txt")).toBe(404);
    expect(await rawGet(server.port, "/audio-actions/..%2fsecret.txt")).toBe(404);
    expect(await rawGet(server.port, "/audio-actions/%2e%2e/secret.txt")).toBe(404);
  });
});
