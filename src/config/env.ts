import { z } from "zod";

const booleanFromString = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const environmentSchema = z.object({
  BOT_STATUS_TEXT: z.string().trim().min(1).max(128).default("música | /play"),
  DATA_DIR: z.string().min(1).default("./data"),
  DEFAULT_VOLUME: z.coerce.number().int().min(0).max(150).default(80),
  DISCORD_CLIENT_ID: z.string().regex(/^\d{17,20}$/),
  DISCORD_GUILD_ID: z.string().regex(/^\d{17,20}$/),
  DISCORD_TOKEN: z.string().min(10),
  HEALTH_PORT: z.coerce.number().int().positive().max(65_535).default(3000),
  IDLE_TIMEOUT_SECONDS: z.coerce.number().int().min(30).max(3_600).default(300),
  LAVALINK_HOST: z.string().min(1),
  LAVALINK_PASSWORD: z.string().min(12),
  LAVALINK_PORT: z.coerce.number().int().positive().max(65_535).default(2333),
  LAVALINK_SECURE: booleanFromString,
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  VOICE_ENABLED: booleanFromString,
  VOICE_STT_MODEL_PATH: z.string().min(1).default("./models/vosk"),
});

export interface AppConfig {
  readonly botStatusText: string;
  readonly dataDir: string;
  readonly defaultVolume: number;
  readonly discord: {
    readonly clientId: string;
    readonly guildId: string;
    readonly token: string;
  };
  readonly healthPort: number;
  readonly idleTimeoutSeconds: number;
  readonly lavalink: {
    readonly host: string;
    readonly password: string;
    readonly port: number;
    readonly secure: boolean;
  };
  readonly logLevel: "fatal" | "error" | "warn" | "info" | "debug" | "trace";
  readonly nodeEnv: "development" | "test" | "production";
  readonly voice: {
    readonly enabled: boolean;
    readonly modelPath: string;
  };
}

export function parseEnv(environment: Record<string, string | undefined>): AppConfig {
  const result = environmentSchema.safeParse(environment);

  if (!result.success) {
    const fields = result.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Invalid environment configuration: ${fields}`);
  }

  return {
    botStatusText: result.data.BOT_STATUS_TEXT,
    dataDir: result.data.DATA_DIR,
    defaultVolume: result.data.DEFAULT_VOLUME,
    discord: {
      clientId: result.data.DISCORD_CLIENT_ID,
      guildId: result.data.DISCORD_GUILD_ID,
      token: result.data.DISCORD_TOKEN,
    },
    healthPort: result.data.HEALTH_PORT,
    idleTimeoutSeconds: result.data.IDLE_TIMEOUT_SECONDS,
    lavalink: {
      host: result.data.LAVALINK_HOST,
      password: result.data.LAVALINK_PASSWORD,
      port: result.data.LAVALINK_PORT,
      secure: result.data.LAVALINK_SECURE,
    },
    logLevel: result.data.LOG_LEVEL,
    nodeEnv: result.data.NODE_ENV,
    voice: {
      enabled: result.data.VOICE_ENABLED,
      modelPath: result.data.VOICE_STT_MODEL_PATH,
    },
  };
}
