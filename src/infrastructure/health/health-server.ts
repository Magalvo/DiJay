import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import type { HealthState } from "./health-state.js";

export interface HealthServer {
  close(): Promise<void>;
  readonly port: number;
}

export async function startHealthServer(port: number, state: HealthState): Promise<HealthServer> {
  const server = createServer((request, response) => {
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
  });

  await listen(server, port);
  const address = server.address() as AddressInfo;
  return {
    close: () => close(server),
    port: address.port,
  };
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
