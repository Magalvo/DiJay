import { afterEach, describe, expect, it, vi } from "vitest";

import { forwardVoiceCommand } from "../../../src/infrastructure/ipc/voice-command-client.js";

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
