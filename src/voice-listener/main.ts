import "dotenv/config";

import {
  type VoiceConnection,
  VoiceConnectionStatus,
  entersState,
  joinVoiceChannel,
} from "@discordjs/voice";
import {
  type ChatInputCommandInteraction,
  Client,
  Events,
  GatewayIntentBits,
  InteractionContextType,
  MessageFlags,
  REST,
  Routes,
  SlashCommandBuilder,
} from "discord.js";
import pino from "pino";

import { parseEnv } from "../config/env.js";
import { voiceGrammar } from "../domain/voice/voice-command.js";
import { forwardVoiceCommand } from "../infrastructure/ipc/voice-command-client.js";
import {
  type CaptureResult,
  DiscordVoiceListener,
} from "../infrastructure/voice/discord-voice-listener.js";
import { resolveTranscript } from "../infrastructure/voice/resolve-transcript.js";
import { VoskSpeechToText } from "../infrastructure/voice/vosk-speech-to-text.js";

const MAX_CAPTURE_MS = 6_000;
const READY_TIMEOUT_MS = 10_000;
// Per-user gap after a capture before the same speaker can trigger another, so one utterance
// is not processed twice.
const WAKE_COOLDOWN_MS = 1_500;

/**
 * Entry point for the voice-listener sidecar (WI-013 / WI-014). Runs as a second Discord bot
 * that only receives audio. In push-to-talk mode it captures one utterance per `/listen`; with
 * VOICE_WAKE_WORD_ENABLED it stays in the channel and acts on any utterance beginning with the
 * wake word. Either way it transcribes with Vosk and forwards the transcript to the main bot's
 * authenticated IPC endpoint, never touching Lavalink, so playback keeps running.
 */
async function main(): Promise<void> {
  const config = parseEnv(process.env);
  const logger = pino({ level: config.logLevel });

  if (config.voiceBot.token.length === 0 || config.voiceBot.clientId.length === 0) {
    throw new Error("VOICE_BOT_TOKEN and VOICE_BOT_CLIENT_ID are required for the voice listener");
  }
  if (!config.voiceIpc.enabled) {
    throw new Error("VOICE_IPC_SECRET is required for the voice listener");
  }

  const stt = new VoskSpeechToText(config.voice.modelPath, voiceGrammar(config.voice.language));
  const listener = new DiscordVoiceListener(stt);
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
  });

  const listenCommand = new SlashCommandBuilder()
    .setName("listen")
    .setDescription("Ouve um comando de voz durante alguns segundos.")
    .setContexts(InteractionContextType.Guild)
    .toJSON();

  client.once(Events.ClientReady, (ready) => {
    const rest = new REST({ version: "10" }).setToken(config.voiceBot.token);
    void rest
      .put(Routes.applicationGuildCommands(config.voiceBot.clientId, config.discord.guildId), {
        body: [listenCommand],
      })
      .then(() => {
        logger.info({ user: ready.user.tag }, "Voice listener ready");
      })
      .catch((error: unknown) => {
        logger.error({ err: error }, "Could not register the listener /listen command");
      });
  });

  client.on(Events.InteractionCreate, (interaction) => {
    if (!interaction.isChatInputCommand() || interaction.commandName !== "listen") {
      return;
    }
    void handleListen(interaction).catch((error: unknown) => {
      logger.error({ err: error }, "Voice listen failed");
    });
  });

  async function handleListen(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.inCachedGuild() || interaction.guildId !== config.discord.guildId) {
      await interaction.reply({ content: "Indisponível.", flags: MessageFlags.Ephemeral });
      return;
    }
    if (config.voice.wakeWordEnabled) {
      // Hands-free mode owns the voice connection; a single-shot capture would fight it.
      await interaction.reply({
        content: "🎙️ Modo mãos-livres ativo — diz «dj» seguido do comando.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const channelId = interaction.member.voice.channelId;
    if (channelId === null) {
      await interaction.reply({
        content: "Entra num canal de voz primeiro.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    let result: CaptureResult;
    try {
      result = await listener.capture({
        adapterCreator: interaction.guild.voiceAdapterCreator,
        channelId,
        guildId: interaction.guildId,
        maxDurationMs: MAX_CAPTURE_MS,
        userId: interaction.user.id,
      });
    } catch (error) {
      logger.error({ err: error, guildId: interaction.guildId }, "Voice capture failed");
      await interaction.editReply("⚠️ Não consegui captar a tua voz. Tenta novamente.");
      return;
    }

    if (result.transcript.trim().length === 0) {
      await interaction.editReply("🎙️ Não percebi nada. Tenta outra vez.");
      return;
    }

    const transcript = await resolveTranscript(result, config.voice.language, false);
    if (transcript === null) {
      await interaction.editReply(`🎙️ "${result.transcript}"\n🤷 Não percebi o comando.`);
      return;
    }

    try {
      const outcome = await forwardVoiceCommand(
        { secret: config.voiceIpc.secret, url: config.voiceIpc.url },
        {
          guildId: interaction.guildId,
          textChannelId: interaction.channelId,
          transcript,
          userId: interaction.user.id,
        },
      );
      await interaction.editReply(`🎙️ "${transcript}"\n${outcome.message}`);
    } catch (error) {
      logger.error({ err: error, guildId: interaction.guildId }, "Voice command forward failed");
      await interaction.editReply(`🎙️ "${transcript}"\n⚠️ Não consegui executar o comando.`);
    }
  }

  function setupWakeWordListening(): { dispose: () => void } {
    const guildId = config.discord.guildId;
    let connection: VoiceConnection | undefined;
    let connectedChannelId: string | undefined;
    let reconciling = false;
    const busy = new Set<string>();
    const cooldownUntil = new Map<string, number>();

    const targetChannelId = (): string | null => {
      const guild = client.guilds.cache.get(guildId);
      if (guild === undefined) {
        return null;
      }
      for (const channel of guild.channels.cache.values()) {
        if (channel.isVoiceBased() && channel.members.some((member) => !member.user.bot)) {
          return channel.id;
        }
      }
      return null;
    };

    const leave = (): void => {
      connection?.destroy();
      connection = undefined;
      connectedChannelId = undefined;
    };

    const onSpeak = (userId: string): void => {
      const receiver = connection?.receiver;
      const channelId = connectedChannelId;
      if (receiver === undefined || channelId === undefined) {
        return;
      }
      if (busy.has(userId) || Date.now() < (cooldownUntil.get(userId) ?? 0)) {
        return;
      }
      busy.add(userId);
      void listener
        .captureUtterance(receiver, userId, MAX_CAPTURE_MS)
        .then(async (result) => {
          cooldownUntil.set(userId, Date.now() + WAKE_COOLDOWN_MS);
          // Surface what Vosk heard so the wake word and commands can be calibrated; drop
          // utterances that do not begin with the wake word.
          if (result.transcript.trim().length > 0) {
            logger.info({ transcript: result.transcript }, "Wake listener heard");
          }
          const transcript = await resolveTranscript(result, config.voice.language, true);
          if (transcript === null) {
            return;
          }
          const outcome = await forwardVoiceCommand(
            { secret: config.voiceIpc.secret, url: config.voiceIpc.url },
            { guildId, textChannelId: channelId, transcript, userId },
          );
          logger.info({ message: outcome.message, transcript }, "Wake command executed");
        })
        .catch((error: unknown) => {
          logger.error({ err: error }, "Wake-word capture failed");
        })
        .finally(() => {
          busy.delete(userId);
        });
    };

    const reconcile = async (): Promise<void> => {
      if (reconciling) {
        return;
      }
      reconciling = true;
      try {
        const target = targetChannelId();
        if (target === null) {
          leave();
          return;
        }
        if (connectedChannelId === target) {
          return;
        }
        leave();
        const guild = client.guilds.cache.get(guildId);
        if (guild === undefined) {
          return;
        }
        const joined = joinVoiceChannel({
          adapterCreator: guild.voiceAdapterCreator,
          channelId: target,
          guildId,
          selfDeaf: false,
          selfMute: true,
        });
        try {
          await entersState(joined, VoiceConnectionStatus.Ready, READY_TIMEOUT_MS);
        } catch (error) {
          logger.error({ err: error }, "Could not join for wake-word listening");
          joined.destroy();
          return;
        }
        connection = joined;
        connectedChannelId = target;
        joined.receiver.speaking.on("start", onSpeak);
        logger.info({ channelId: target }, "Hands-free wake-word listening in channel");
      } finally {
        reconciling = false;
      }
    };

    client.on(Events.VoiceStateUpdate, () => {
      void reconcile();
    });
    client.once(Events.ClientReady, () => {
      void reconcile();
    });

    return { dispose: leave };
  }

  const wakeWord = config.voice.wakeWordEnabled ? setupWakeWordListening() : undefined;

  const shutdown = async (): Promise<void> => {
    wakeWord?.dispose();
    stt.close();
    await client.destroy();
  };
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      void shutdown();
    });
  }

  await client.login(config.voiceBot.token);
}

void main().catch((error: unknown) => {
  console.error("Voice listener failed to start.", error);
  process.exitCode = 1;
});
