import { createServer, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { extname, join, normalize, resolve, sep } from "node:path";
import { readFile } from "node:fs/promises";

import type { HealthState } from "./health-state.js";

export interface HealthServer {
  close(): Promise<void>;
  readonly port: number;
}

export interface HealthServerOptions {
  readonly audioActionsDir?: string;
}

const allowedAudioExtensions = new Set([".mp3", ".ogg", ".wav"]);

export async function startHealthServer(
  port: number,
  state: HealthState,
  options: HealthServerOptions = {},
): Promise<HealthServer> {
  const server = createServer((request, response) => {
    void (async () => {
      if (request.method === "GET" && request.url?.startsWith("/audio-actions/") === true) {
        await serveAudioAction(request.url, options.audioActionsDir, response);
        return;
      }

      if (request.method !== "GET" || request.url !== "/health") {
        response.writeHead(404).end();
        return;
      }
      const snapshot = state.snapshot();
      response
        .writeHead(snapshot.healthy ? 200 : 503, {
          "content-type": "application/json; charset=utf-8",
        })
        .end(JSON.stringify(snapshot));
    })().catch(() => {
      if (!response.headersSent) {
        response.writeHead(500).end();
      } else {
        response.end();
      }
    });
  });

  await listen(server, port);
  const address = server.address() as AddressInfo;
  return {
    close: () => close(server),
    port: address.port,
  };
}

async function serveAudioAction(
  requestUrl: string,
  directory: string | undefined,
  response: ServerResponse,
): Promise<void> {
  if (directory === undefined) {
    response.writeHead(404).end();
    return;
  }
  const file = decodeURIComponent(requestUrl.slice("/audio-actions/".length).split("?")[0] ?? "");
  if (!isSafeAudioPath(file)) {
    response.writeHead(404).end();
    return;
  }
  const root = resolve(directory);
  const target = resolve(join(root, file));
  if (target !== root && !target.startsWith(`${root}${sep}`)) {
    response.writeHead(404).end();
    return;
  }
  try {
    const contents = await readFile(target);
    response.writeHead(200, { "content-type": contentTypeForAudio(target) }).end(contents);
  } catch {
    response.writeHead(404).end();
  }
}

function isSafeAudioPath(file: string): boolean {
  const normalized = normalize(file);
  return (
    normalized.length > 0 &&
    normalized !== "." &&
    normalized !== ".." &&
    !normalized.startsWith(`..${sep}`) &&
    allowedAudioExtensions.has(extname(normalized).toLowerCase())
  );
}

function contentTypeForAudio(file: string): string {
  switch (extname(file).toLowerCase()) {
    case ".mp3":
      return "audio/mpeg";
    case ".ogg":
      return "audio/ogg";
    case ".wav":
      return "audio/wav";
    default:
      return "application/octet-stream";
  }
}

function listen(server: Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "0.0.0.0", () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error === undefined) {
        resolve();
      } else {
        reject(error);
      }
    });
  });
}
