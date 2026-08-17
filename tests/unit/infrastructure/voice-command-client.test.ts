import { afterEach, describe, expect, it, vi } from "vitest";

import {
  fetchVoiceListenerSettings,
  forwardVoiceCommand,
} from "../../../src/infrastructure/ipc/voice-command-client.js";

const payload = {
  guildId: "guild-1",
  textChannelId: "text-1",
  transcript: "pausa",
  userId: "user-1",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("forwardVoiceCommand", () => {
  it("posts the signed payload and returns the parsed response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ handled: true, message: "⏸️ Pausado." }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await forwardVoiceCommand(
      { secret: "a-very-long-shared-secret", url: "http://main:3100" },
      payload,
    );

    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe("http://main:3100/voice/command");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ "x-voice-secret": "a-very-long-shared-secret" });
    expect(JSON.parse(init.body as string)).toEqual(payload);
    expect(result).toEqual({ handled: true, message: "⏸️ Pausado." });
  });

  it("throws when the endpoint returns an error status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }));

    await expect(
      forwardVoiceCommand({ secret: "s", url: "http://main:3100" }, payload),
    ).rejects.toThrow(/401/);
  });
});

describe("fetchVoiceListenerSettings", () => {
  it("polls the settings endpoint with the guild id and secret, and returns the parsed body", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          commandsEnabled: false,
          joinGreetingEnabled: false,
          language: "en",
          soundsEnabled: true,
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchVoiceListenerSettings(
      { secret: "a-very-long-shared-secret", url: "http://main:3100" },
      "guild-1",
    );

    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe("http://main:3100/voice/settings?guildId=guild-1");
    expect(init.method).toBe("GET");
    expect(init.headers).toMatchObject({ "x-voice-secret": "a-very-long-shared-secret" });
    expect(result).toEqual({
      commandsEnabled: false,
      joinGreetingEnabled: false,
      language: "en",
      soundsEnabled: true,
    });
  });

  it("URL-encodes the guild id in the query string", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          commandsEnabled: true,
          joinGreetingEnabled: true,
          language: "pt",
          soundsEnabled: true,
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await fetchVoiceListenerSettings({ secret: "s", url: "http://main:3100" }, "guild with spaces");

    const [url] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe("http://main:3100/voice/settings?guildId=guild%20with%20spaces");
  });

  it("throws when the endpoint returns an error status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 403 }));

    await expect(
      fetchVoiceListenerSettings({ secret: "s", url: "http://main:3100" }, "guild-1"),
    ).rejects.toThrow(/403/);
  });
});
