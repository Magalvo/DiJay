import { z } from "zod";

const booleanFromString = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const environmentSchema = z.object({
  AUDIO_ACTIONS_BASE_URL: z.string().trim().url().default("http://bot:3000/audio-actions"),
  AUDIO_ACTIONS_DIR: z.string().min(1).default("./audio-actions"),
  AUDIO_ACTIONS_ENABLED: booleanFromString,
  AUDIO_ACTIONS_MANIFEST: z.string().min(1).default("./audio-actions/actions.json"),
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
  // Descriptive only: Spotify resolution lives in Lavalink/LavaSrc, usually via the
  // spotify-tokener compose overlay. The bot reads this only for the startup log.
  SPOTIFY_ENABLED: booleanFromString,
  // Second Discord app used only by the voice-listener sidecar (WI-013).
  VOICE_BOT_CLIENT_ID: z.string().trim().default(""),
  VOICE_BOT_TOKEN: z.string().trim().default(""),
  VOICE_ENABLED: booleanFromString,
  // Language of the spoken-command grammar and parser (Vosk model must match).
  VOICE_LANGUAGE: z.enum(["pt", "en"]).default("pt"),
  // Hands-free mode on the listener sidecar (WI-014): stay in the channel and act on any
  // utterance that begins with the wake word ("dj"). Opt-in; off keeps push-to-talk /listen.
  VOICE_WAKE_WORD_ENABLED: booleanFromString,
  // Self-triggering soundboard words (WI-015): comma-separated `key:soundId` pairs mapping a
  // spoken trigger (e.g. "gelado") to a Discord soundboard sound id. Empty disables the
  // feature. The keys must match the domain's soundboard triggers to be recognizable.
  VOICE_SOUNDBOARD_SOUNDS: z
    .string()
    .trim()
    .default("")
    .transform((raw, ctx) => {
      const sounds: Record<string, string> = {};
      for (const entry of raw
        .split(",")
        .map((part) => part.trim())
        .filter((part) => part.length > 0)) {
        const separator = entry.indexOf(":");
        const key = separator > 0 ? entry.slice(0, separator).trim().toLowerCase() : "";
        const id = separator > 0 ? entry.slice(separator + 1).trim() : "";
        if (key.length === 0 || !/^\d{17,20}$/.test(id)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `malformed entry "${entry}" (expected key:snowflake)`,
          });
          return z.NEVER;
        }
        sounds[key] = id;
      }
      return sounds;
    }),
  // Internal IPC between the listener and the main bot, on the private network only.
  VOICE_IPC_PORT: z.coerce.number().int().positive().max(65_535).default(3_100),
  VOICE_IPC_SECRET: z
    .string()
    .trim()
    .default("")
    .refine((value) => value.length === 0 || value.length >= 16, {
      message: "VOICE_IPC_SECRET must be at least 16 characters when set",
    }),
  VOICE_IPC_URL: z.string().trim().default("http://bot:3100"),
  VOICE_STT_MODEL_PATH: z.string().min(1).default("./models/vosk"),
  // Per-language model paths for the live PT/EN toggle (WI-016). When both are set the listener
  // can switch models at runtime; otherwise VOICE_STT_MODEL_PATH is used for VOICE_LANGUAGE only.
  VOICE_STT_MODEL_PATH_EN: z.string().trim().default(""),
  VOICE_STT_MODEL_PATH_PT: z.string().trim().default(""),
});

export interface AppConfig {
  readonly audioActions: {
    readonly baseUrl: string;
    readonly dir: string;
    readonly enabled: boolean;
    readonly manifest: string;
  };
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
  readonly spotify: {
    readonly enabled: boolean;
  };
  readonly voice: {
    readonly enabled: boolean;
    readonly language: "pt" | "en";
    readonly modelPath: string;
    /** Per-language model paths for the runtime PT/EN toggle; null when that model is absent. */
    readonly modelPaths: { readonly en: string | null; readonly pt: string | null };
    /** Spoken trigger word -> Discord soundboard sound id. Empty when the feature is off. */
    readonly soundboardSounds: Readonly<Record<string, string>>;
    readonly wakeWordEnabled: boolean;
  };
  readonly voiceBot: {
    readonly clientId: string;
    readonly token: string;
  };
  readonly voiceIpc: {
    readonly enabled: boolean;
    readonly port: number;
    readonly secret: string;
    readonly url: string;
  };
}

export function parseEnv(environment: Record<string, string | undefined>): AppConfig {
  const result = environmentSchema.safeParse(environment);

  if (!result.success) {
    const fields = result.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Invalid environment configuration: ${fields}`);
  }

  return {
    audioActions: {
      baseUrl: result.data.AUDIO_ACTIONS_BASE_URL,
      dir: result.data.AUDIO_ACTIONS_DIR,
      enabled: result.data.AUDIO_ACTIONS_ENABLED,
      manifest: result.data.AUDIO_ACTIONS_MANIFEST,
    },
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
    spotify: {
      enabled: result.data.SPOTIFY_ENABLED,
    },
    voice: {
      enabled: result.data.VOICE_ENABLED,
      language: result.data.VOICE_LANGUAGE,
      modelPath: result.data.VOICE_STT_MODEL_PATH,
      modelPaths: {
        en:
          result.data.VOICE_STT_MODEL_PATH_EN ||
          (result.data.VOICE_LANGUAGE === "en" ? result.data.VOICE_STT_MODEL_PATH : "") ||
          null,
        pt:
          result.data.VOICE_STT_MODEL_PATH_PT ||
          (result.data.VOICE_LANGUAGE === "pt" ? result.data.VOICE_STT_MODEL_PATH : "") ||
          null,
      },
      soundboardSounds: result.data.VOICE_SOUNDBOARD_SOUNDS,
      wakeWordEnabled: result.data.VOICE_WAKE_WORD_ENABLED,
    },
    voiceBot: {
      clientId: result.data.VOICE_BOT_CLIENT_ID,
      token: result.data.VOICE_BOT_TOKEN,
    },
    voiceIpc: {
      enabled: result.data.VOICE_IPC_SECRET.length > 0,
      port: result.data.VOICE_IPC_PORT,
      secret: result.data.VOICE_IPC_SECRET,
      url: result.data.VOICE_IPC_URL,
    },
  };
}
