import "dotenv/config";

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
import { DiscordVoiceListener } from "../infrastructure/voice/discord-voice-listener.js";
import { VoskSpeechToText } from "../infrastructure/voice/vosk-speech-to-text.js";

const MAX_CAPTURE_MS = 6_000;

/**
 * Entry point for the voice-listener sidecar (WI-013). Runs as a second Discord bot that only
 * receives audio: it captures one push-to-talk utterance, transcribes it with Vosk, and
 * forwards the recognized transcript to the main bot's authenticated IPC endpoint. It never
 * touches Lavalink, so playback on the main bot keeps running.
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
    const channelId = interaction.member.voice.channelId;
    if (channelId === null) {
      await interaction.reply({
        content: "Entra num canal de voz primeiro.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    let transcript: string;
    try {
      transcript = await listener.capture({
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

    if (transcript.trim().length === 0) {
      await interaction.editReply("🎙️ Não percebi nada. Tenta outra vez.");
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

  const shutdown = async (): Promise<void> => {
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
