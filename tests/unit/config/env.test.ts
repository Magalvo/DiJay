import { describe, expect, it } from "vitest";

import { parseEnv } from "../../../src/config/env.js";

const validEnv = {
  DISCORD_CLIENT_ID: "123456789012345678",
  DISCORD_GUILD_ID: "123456789012345679",
  DISCORD_TOKEN: "a-valid-looking-token",
  LAVALINK_HOST: "localhost",
  LAVALINK_PASSWORD: "a-long-local-password",
};

describe("parseEnv", () => {
  it("parses defaults and coerces Lavalink settings", () => {
    expect(parseEnv(validEnv)).toMatchObject({
      discord: {
        clientId: validEnv.DISCORD_CLIENT_ID,
        guildId: validEnv.DISCORD_GUILD_ID,
        token: validEnv.DISCORD_TOKEN,
      },
      botStatusText: "música | /play",
      dataDir: "./data",
      defaultVolume: 80,
      healthPort: 3000,
      idleTimeoutSeconds: 300,
      lavalink: {
        host: "localhost",
        password: validEnv.LAVALINK_PASSWORD,
        port: 2333,
        secure: false,
      },
      logLevel: "info",
      nodeEnv: "development",
    });
  });

  it("disables voice recognition by default and can enable it", () => {
    expect(parseEnv(validEnv)).toMatchObject({
      voice: { enabled: false, modelPath: "./models/vosk" },
    });
    expect(
      parseEnv({ ...validEnv, VOICE_ENABLED: "true", VOICE_STT_MODEL_PATH: "/opt/vosk-pt" }),
    ).toMatchObject({ voice: { enabled: true, modelPath: "/opt/vosk-pt" } });
  });

  it("treats Spotify as unconfigured unless both credentials are present", () => {
    expect(parseEnv(validEnv)).toMatchObject({ spotify: { configured: false } });
    expect(parseEnv({ ...validEnv, SPOTIFY_CLIENT_ID: "id-only" })).toMatchObject({
      spotify: { configured: false },
    });
    expect(parseEnv({ ...validEnv, SPOTIFY_CLIENT_SECRET: "secret-only" })).toMatchObject({
      spotify: { configured: false },
    });
    expect(
      parseEnv({ ...validEnv, SPOTIFY_CLIENT_ID: "id", SPOTIFY_CLIENT_SECRET: "secret" }),
    ).toMatchObject({ spotify: { configured: true } });
  });

  it("accepts a custom bot activity text", () => {
    expect(parseEnv({ ...validEnv, BOT_STATUS_TEXT: "pedidos com /play" })).toMatchObject({
      botStatusText: "pedidos com /play",
    });
  });

  it("rejects missing secrets with a configuration error", () => {
    expect(() => parseEnv({})).toThrowError(/Invalid environment configuration/);
  });

  it("requires the private guild allowlist", () => {
    const withoutGuild: Record<string, string | undefined> = { ...validEnv };
    withoutGuild.DISCORD_GUILD_ID = undefined;

    expect(() => parseEnv(withoutGuild)).toThrowError(/DISCORD_GUILD_ID/);
  });
});
