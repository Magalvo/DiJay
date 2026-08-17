import { describe, expect, it, vi } from "vitest";

import type { PlaybackRequest } from "../../../src/application/music/music-gateway.js";
import { MusicError } from "../../../src/domain/music/music-error.js";
import {
  handleVoiceCommand,
  handleVoiceSettings,
  type VoiceCommandDispatch,
} from "../../../src/infrastructure/ipc/voice-command-server.js";

const SECRET = "a-very-long-shared-secret";

const request: PlaybackRequest = {
  guildId: "guild-1",
  requesterId: "user-1",
  textChannelId: "text-1",
  voiceChannelId: "voice-1",
};

function dispatch(overrides: Partial<VoiceCommandDispatch> = {}): VoiceCommandDispatch {
  return {
    secret: SECRET,
    currentSettings: vi.fn().mockResolvedValue({
      commandsEnabled: true,
      joinGreetingEnabled: true,
      language: "pt",
      soundsEnabled: true,
    }),
    isAllowed: (guildId) => guildId === "guild-1",
    resolveRequest: () => request,
    handle: vi.fn().mockResolvedValue({ handled: true, intent: "pause", message: "⏸️ Pausado." }),
    ...overrides,
  };
}

function body(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    guildId: "guild-1",
    textChannelId: "text-1",
    transcript: "pausa",
    userId: "user-1",
    ...overrides,
  });
}

describe("handleVoiceCommand", () => {
  it("rejects an unknown route", async () => {
    const result = await handleVoiceCommand(dispatch(), {
      method: "GET",
      path: "/other",
      secret: SECRET,
      rawBody: "",
    });
    expect(result.status).toBe(404);
  });

  it("rejects a missing or wrong secret without dispatching", async () => {
    const deps = dispatch();
    const missing = await handleVoiceCommand(deps, {
      method: "POST",
      path: "/voice/command",
      secret: undefined,
      rawBody: body(),
    });
    const wrong = await handleVoiceCommand(deps, {
      method: "POST",
      path: "/voice/command",
      secret: "nope",
      rawBody: body(),
    });
    expect(missing.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(deps.handle).not.toHaveBeenCalled();
  });

  it("refuses a guild outside the allowlist", async () => {
    const result = await handleVoiceCommand(dispatch(), {
      method: "POST",
      path: "/voice/command",
      secret: SECRET,
      rawBody: body({ guildId: "guild-2" }),
    });
    expect(result.status).toBe(403);
  });

  it("returns 400 for a malformed body", async () => {
    const result = await handleVoiceCommand(dispatch(), {
      method: "POST",
      path: "/voice/command",
      secret: SECRET,
      rawBody: "{ not json",
    });
    expect(result.status).toBe(400);
  });

  it("returns 409 when the user is not in a voice channel", async () => {
    const result = await handleVoiceCommand(dispatch({ resolveRequest: () => null }), {
      method: "POST",
      path: "/voice/command",
      secret: SECRET,
      rawBody: body(),
    });
    expect(result.status).toBe(409);
    expect(result.body).toMatchObject({ handled: false });
  });

  it("dispatches a valid command and returns the outcome", async () => {
    const deps = dispatch();
    const result = await handleVoiceCommand(deps, {
      method: "POST",
      path: "/voice/command",
      secret: SECRET,
      rawBody: body(),
    });
    expect(deps.handle).toHaveBeenCalledWith("pausa", request, undefined);
    expect(result).toEqual({ status: 200, body: { handled: true, message: "⏸️ Pausado." } });
  });

  it("forwards the recognized language to the handler", async () => {
    const deps = dispatch();
    await handleVoiceCommand(deps, {
      method: "POST",
      path: "/voice/command",
      secret: SECRET,
      rawBody: body({ language: "en" }),
    });
    expect(deps.handle).toHaveBeenCalledWith("pausa", request, "en");
  });

  it("maps a domain error to a user-facing message with 200", async () => {
    const handle = vi.fn().mockRejectedValue(new MusicError("NOTHING_PLAYING", "no playback"));
    const result = await handleVoiceCommand(dispatch({ handle }), {
      method: "POST",
      path: "/voice/command",
      secret: SECRET,
      rawBody: body(),
    });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      handled: false,
      message: "Não há música em reprodução neste servidor.",
    });
  });
});

describe("handleVoiceSettings", () => {
  const ok = { method: "GET", path: "/voice/settings", secret: SECRET } as const;

  it("returns the guild's current voice settings", async () => {
    const deps = dispatch({
      currentSettings: vi.fn().mockResolvedValue({
        commandsEnabled: false,
        joinGreetingEnabled: false,
        language: "en",
        soundsEnabled: true,
      }),
    });
    const result = await handleVoiceSettings(deps, { ...ok, guildId: "guild-1" });
    expect(result).toEqual({
      status: 200,
      body: {
        commandsEnabled: false,
        joinGreetingEnabled: false,
        language: "en",
        soundsEnabled: true,
      },
    });
    expect(deps.currentSettings).toHaveBeenCalledWith("guild-1");
  });

  it("rejects a wrong secret, foreign guild, missing guild, and wrong route", async () => {
    const deps = dispatch();
    expect(
      (await handleVoiceSettings(deps, { ...ok, secret: "nope", guildId: "guild-1" })).status,
    ).toBe(401);
    expect((await handleVoiceSettings(deps, { ...ok, guildId: "guild-2" })).status).toBe(403);
    expect((await handleVoiceSettings(deps, { ...ok, guildId: undefined })).status).toBe(400);
    expect(
      (await handleVoiceSettings(deps, { ...ok, path: "/voice/command", guildId: "guild-1" }))
        .status,
    ).toBe(404);
    expect(deps.currentSettings).not.toHaveBeenCalled();
  });
});
