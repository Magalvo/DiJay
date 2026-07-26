import { timingSafeEqual } from "node:crypto";
import { createServer, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import type { Logger } from "pino";

import type { PlaybackRequest } from "../../application/music/music-gateway.js";
import type { VoiceCommandOutcome } from "../../application/voice/voice-command-service.js";
import { MusicError } from "../../domain/music/music-error.js";
import type { VoiceLanguage } from "../../domain/voice/voice-command.js";
import { userFacingMusicError } from "../../presentation/discord/user-messages.js";
import {
  VOICE_COMMAND_PATH,
  VOICE_LANGUAGE_PATH,
  VOICE_SECRET_HEADER,
  type VoiceCommandRequestBody,
  type VoiceCommandResponseBody,
  type VoiceLanguageResponseBody,
} from "./voice-command-contract.js";

/**
 * Everything the IPC endpoint needs to authorize and dispatch a spoken command. The main bot
 * supplies these so the transport stays free of Discord types and is unit-testable.
 */
export interface VoiceCommandDispatch {
  readonly secret: string;
  /** Current voice language for a guild, so the listener can follow changes made via /settings. */
  currentLanguage(guildId: string): Promise<VoiceLanguage>;
  handle(
    transcript: string,
    request: PlaybackRequest,
    language: VoiceLanguage | undefined,
  ): Promise<VoiceCommandOutcome>;
  isAllowed(guildId: string): boolean;
  /**
   * Builds a playback request from the main bot's own voice-state cache, or null when the
   * user is not in a voice channel. The channel is never taken from the payload.
   */
  resolveRequest(guildId: string, userId: string, textChannelId: string): PlaybackRequest | null;
}

export interface VoiceCommandHandlerInput {
  readonly method: string;
  readonly path: string;
  readonly rawBody: string;
  readonly secret: string | undefined;
}

export interface VoiceCommandHandlerResult {
  readonly body: VoiceCommandResponseBody | { readonly error: string };
  readonly status: number;
}

export interface VoiceLanguageHandlerInput {
  readonly guildId: string | undefined;
  readonly method: string;
  readonly path: string;
  readonly secret: string | undefined;
}

export interface VoiceLanguageHandlerResult {
  readonly body: VoiceLanguageResponseBody | { readonly error: string };
  readonly status: number;
}

export interface VoiceCommandServer {
  close(): Promise<void>;
  readonly port: number;
}

/**
 * Pure request handler: validates the secret, allowlist, and voice-channel membership, then
 * dispatches through the injected `handle`. Kept transport-free so it is exhaustively tested
 * without binding a socket.
 */
export async function handleVoiceCommand(
  deps: VoiceCommandDispatch,
  input: VoiceCommandHandlerInput,
): Promise<VoiceCommandHandlerResult> {
  if (input.method !== "POST" || input.path !== VOICE_COMMAND_PATH) {
    return { body: { error: "not found" }, status: 404 };
  }
  if (!secretMatches(deps.secret, input.secret)) {
    return { body: { error: "unauthorized" }, status: 401 };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(input.rawBody);
  } catch {
    return { body: { error: "invalid json" }, status: 400 };
  }
  const payload = asRequestBody(parsed);
  if (payload === null) {
    return { body: { error: "invalid payload" }, status: 400 };
  }
  if (!deps.isAllowed(payload.guildId)) {
    return { body: { error: "forbidden" }, status: 403 };
  }

  const request = deps.resolveRequest(payload.guildId, payload.userId, payload.textChannelId);
  if (request === null) {
    return { body: { handled: false, message: "Não estás num canal de voz." }, status: 409 };
  }

  try {
    const outcome = await deps.handle(payload.transcript, request, payload.language);
    return { body: { handled: outcome.handled, message: outcome.message }, status: 200 };
  } catch (error) {
    if (error instanceof MusicError) {
      return { body: { handled: false, message: userFacingMusicError(error) }, status: 200 };
    }
    // Unexpected: let the transport log it and answer 500.
    throw error;
  }
}

/**
 * Pure handler for the language poll: validates the secret and allowlist, then returns the
 * guild's current voice language so the listener can follow /settings changes. Transport-free.
 */
export async function handleVoiceLanguage(
  deps: VoiceCommandDispatch,
  input: VoiceLanguageHandlerInput,
): Promise<VoiceLanguageHandlerResult> {
  if (input.method !== "GET" || input.path !== VOICE_LANGUAGE_PATH) {
    return { body: { error: "not found" }, status: 404 };
  }
  if (!secretMatches(deps.secret, input.secret)) {
    return { body: { error: "unauthorized" }, status: 401 };
  }
  if (input.guildId === undefined || input.guildId.length === 0) {
    return { body: { error: "invalid payload" }, status: 400 };
  }
  if (!deps.isAllowed(input.guildId)) {
    return { body: { error: "forbidden" }, status: 403 };
  }
  const language = await deps.currentLanguage(input.guildId);
  return { body: { language }, status: 200 };
}

/**
 * Binds `handleVoiceCommand` to an HTTP server on the private network. Never publish this
 * port; the shared secret is the primary gate and the allowlist the second.
 */
export async function startVoiceCommandServer(
  port: number,
  deps: VoiceCommandDispatch,
  logger: Logger,
): Promise<VoiceCommandServer> {
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    const rawUrl = request.url ?? "";
    const path = rawUrl.split("?")[0] ?? "";
    const method = request.method ?? "";
    const secret = headerValue(request.headers[VOICE_SECRET_HEADER]);
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("error", () => respond(response, { body: { error: "bad request" }, status: 400 }));
    request.on("end", () => {
      const onError = (error: unknown): void => {
        logger.error({ err: error }, "Voice command IPC dispatch failed");
        respond(response, { body: { error: "internal error" }, status: 500 });
      };
      if (method === "GET" && path === VOICE_LANGUAGE_PATH) {
        void handleVoiceLanguage(deps, {
          guildId: queryParam(rawUrl, "guildId"),
          method,
          path,
          secret,
        })
          .then((result) => respond(response, result))
          .catch(onError);
        return;
      }
      void handleVoiceCommand(deps, {
        method,
        path,
        rawBody: Buffer.concat(chunks).toString("utf8"),
        secret,
      })
        .then((result) => respond(response, result))
        .catch(onError);
    });
  });

  await listen(server, port);
  const address = server.address() as AddressInfo;
  return { close: () => close(server), port: address.port };
}

function asRequestBody(value: unknown): VoiceCommandRequestBody | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const { guildId, language, textChannelId, transcript, userId } = record;
  if (
    typeof guildId === "string" &&
    guildId.length > 0 &&
    typeof userId === "string" &&
    userId.length > 0 &&
    typeof textChannelId === "string" &&
    textChannelId.length > 0 &&
    typeof transcript === "string" &&
    transcript.trim().length > 0
  ) {
    const base = { guildId, textChannelId, transcript, userId };
    // Only include `language` when valid: exactOptionalPropertyTypes forbids an explicit
    // `undefined` for the optional property.
    return language === "pt" || language === "en" ? { ...base, language } : base;
  }
  return null;
}

function queryParam(rawUrl: string, name: string): string | undefined {
  const query = rawUrl.split("?")[1];
  if (query === undefined) {
    return undefined;
  }
  const value = new URLSearchParams(query).get(name);
  return value === null ? undefined : value;
}

function secretMatches(expected: string, provided: string | undefined): boolean {
  if (provided === undefined || expected.length === 0) {
    return false;
  }
  const expectedBytes = Buffer.from(expected);
  const providedBytes = Buffer.from(provided);
  if (expectedBytes.length !== providedBytes.length) {
    return false;
  }
  return timingSafeEqual(expectedBytes, providedBytes);
}

function headerValue(header: string | string[] | undefined): string | undefined {
  return Array.isArray(header) ? header[0] : header;
}

function respond(response: ServerResponse, result: { body: unknown; status: number }): void {
  response
    .writeHead(result.status, { "content-type": "application/json; charset=utf-8" })
    .end(JSON.stringify(result.body));
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
