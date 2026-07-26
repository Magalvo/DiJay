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
      voice: { enabled: false, language: "pt", modelPath: "./models/vosk" },
    });
    expect(
      parseEnv({ ...validEnv, VOICE_ENABLED: "true", VOICE_STT_MODEL_PATH: "/opt/vosk-pt" }),
    ).toMatchObject({ voice: { enabled: true, modelPath: "/opt/vosk-pt" } });
  });

  it("selects the voice language, defaulting to Portuguese", () => {
    expect(parseEnv(validEnv)).toMatchObject({ voice: { language: "pt" } });
    expect(parseEnv({ ...validEnv, VOICE_LANGUAGE: "en" })).toMatchObject({
      voice: { language: "en" },
    });
    expect(() => parseEnv({ ...validEnv, VOICE_LANGUAGE: "fr" })).toThrowError(/VOICE_LANGUAGE/);
  });

  it("derives per-language model paths, defaulting the primary to the configured language", () => {
    // With only VOICE_STT_MODEL_PATH, that path maps to VOICE_LANGUAGE; the other is absent.
    expect(
      parseEnv({ ...validEnv, VOICE_LANGUAGE: "pt", VOICE_STT_MODEL_PATH: "/m/pt" }),
    ).toMatchObject({ voice: { modelPaths: { pt: "/m/pt", en: null } } });

    // Explicit per-language paths enable the runtime toggle for both.
    expect(
      parseEnv({
        ...validEnv,
        VOICE_STT_MODEL_PATH_PT: "/m/pt",
        VOICE_STT_MODEL_PATH_EN: "/m/en",
      }),
    ).toMatchObject({ voice: { modelPaths: { pt: "/m/pt", en: "/m/en" } } });
  });

  it("disables hands-free wake-word listening by default and can enable it", () => {
    expect(parseEnv(validEnv)).toMatchObject({ voice: { wakeWordEnabled: false } });
    expect(parseEnv({ ...validEnv, VOICE_WAKE_WORD_ENABLED: "true" })).toMatchObject({
      voice: { wakeWordEnabled: true },
    });
  });

  it("parses soundboard trigger mappings, empty by default", () => {
    expect(parseEnv(validEnv)).toMatchObject({ voice: { soundboardSounds: {} } });
    expect(
      parseEnv({ ...validEnv, VOICE_SOUNDBOARD_SOUNDS: "gelado:123456789012345678" }),
    ).toMatchObject({ voice: { soundboardSounds: { gelado: "123456789012345678" } } });
    expect(
      parseEnv({
        ...validEnv,
        VOICE_SOUNDBOARD_SOUNDS: " GELADO : 123456789012345678 , outro:123456789012345679 ",
      }),
    ).toMatchObject({
      voice: {
        soundboardSounds: { gelado: "123456789012345678", outro: "123456789012345679" },
      },
    });
  });

  it("rejects a malformed soundboard mapping", () => {
    expect(() =>
      parseEnv({ ...validEnv, VOICE_SOUNDBOARD_SOUNDS: "gelado:not-a-snowflake" }),
    ).toThrowError(/VOICE_SOUNDBOARD_SOUNDS/);
    expect(() => parseEnv({ ...validEnv, VOICE_SOUNDBOARD_SOUNDS: "missing-id" })).toThrowError(
      /VOICE_SOUNDBOARD_SOUNDS/,
    );
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

  it("exposes voice IPC and second-bot config, disabled without a shared secret", () => {
    expect(parseEnv(validEnv)).toMatchObject({
      voiceIpc: { enabled: false, port: 3100, secret: "", url: "http://bot:3100" },
      voiceBot: { clientId: "", token: "" },
    });

    const configured = parseEnv({
      ...validEnv,
      VOICE_IPC_SECRET: "a-very-long-shared-secret",
      VOICE_IPC_PORT: "3200",
      VOICE_IPC_URL: "http://main:3200",
      VOICE_BOT_TOKEN: "second-bot-token",
      VOICE_BOT_CLIENT_ID: "123456789012345680",
    });
    expect(configured).toMatchObject({
      voiceIpc: { enabled: true, port: 3200, url: "http://main:3200" },
      voiceBot: { clientId: "123456789012345680", token: "second-bot-token" },
    });
  });

  it("rejects a voice IPC secret that is too short", () => {
    expect(() => parseEnv({ ...validEnv, VOICE_IPC_SECRET: "short" })).toThrowError(
      /VOICE_IPC_SECRET/,
    );
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
