import "dotenv/config";

import {
  type VoiceConnection,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  joinVoiceChannel,
} from "@discordjs/voice";
import {
  ChannelType,
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
import {
  matchSoundboardTrigger,
  type VoiceLanguage,
  voiceGrammar,
} from "../domain/voice/voice-command.js";
import {
  fetchVoiceLanguage,
  forwardVoiceCommand,
} from "../infrastructure/ipc/voice-command-client.js";
import {
  type CaptureResult,
  DiscordVoiceListener,
} from "../infrastructure/voice/discord-voice-listener.js";
import { resolveTranscript } from "../infrastructure/voice/resolve-transcript.js";
import { VoskSpeechToText } from "../infrastructure/voice/vosk-speech-to-text.js";
import { VoiceGreetingPlayer } from "./voice-greeting-player.js";

const MAX_CAPTURE_MS = 6_000;
const READY_TIMEOUT_MS = 10_000;
// Per-user gap after a capture before the same speaker can trigger another, so one utterance
// is not processed twice.
const WAKE_COOLDOWN_MS = 1_500;
// How often the listener asks the main bot for the configured voice language (WI-016), so a
// change made via /settings takes effect within one interval without a restart.
const LANGUAGE_POLL_MS = 15_000;

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

  // The active recognition language and its Vosk model can change at runtime (WI-016). Both
  // per-language model paths must exist on disk to switch; the initial language uses the model
  // guaranteed by env (VOICE_STT_MODEL_PATH maps to VOICE_LANGUAGE).
  const modelPaths = config.voice.modelPaths;
  const loadStt = (language: VoiceLanguage): VoskSpeechToText => {
    const path = modelPaths[language];
    if (path === null) {
      throw new Error(`No Vosk model path configured for language "${language}"`);
    }
    return new VoskSpeechToText(path, voiceGrammar(language));
  };

  let activeLanguage: VoiceLanguage = config.voice.language;
  let activeStt = loadStt(activeLanguage);
  const listener = new DiscordVoiceListener(activeStt);

  const switchLanguage = (language: VoiceLanguage): void => {
    if (language === activeLanguage) {
      return;
    }
    if (modelPaths[language] === null) {
      logger.warn({ language }, "Voice language change ignored: no model configured for it");
      return;
    }
    let next: VoskSpeechToText;
    try {
      next = loadStt(language);
    } catch (error) {
      logger.error({ err: error, language }, "Could not load voice model for language switch");
      return;
    }
    const previous = activeStt;
    activeStt = next;
    activeLanguage = language;
    listener.useSpeechToText(next);
    // Defer freeing the old native model so any in-flight capture finishes on it first.
    setTimeout(() => previous.close(), MAX_CAPTURE_MS + 2_000).unref();
    logger.info({ language }, "Voice recognition model switched");
  };

  const ipcConfig = { secret: config.voiceIpc.secret, url: config.voiceIpc.url };
  const pollLanguage = async (): Promise<void> => {
    try {
      switchLanguage(await fetchVoiceLanguage(ipcConfig, config.discord.guildId));
    } catch (error) {
      logger.debug({ err: error }, "Voice language poll failed");
    }
  };

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
  });
  const greetingPlayer =
    config.voice.greeting.enabled && config.voice.greeting.file.length > 0
      ? new VoiceGreetingPlayer({
          cooldownSeconds: config.voice.greeting.cooldownSeconds,
          createAudioResource,
          createPlayer: createAudioPlayer,
          file: config.voice.greeting.file,
          subscribe: (connection, player) => {
            (connection as VoiceConnection).subscribe(
              player as ReturnType<typeof createAudioPlayer>,
            );
          },
        })
      : undefined;

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

    const transcript = await resolveTranscript(result, activeLanguage, false);
    if (transcript === null) {
      await interaction.editReply(`🎙️ "${result.transcript}"\n🤷 Não percebi o comando.`);
      return;
    }

    try {
      const outcome = await forwardVoiceCommand(ipcConfig, {
        guildId: interaction.guildId,
        language: activeLanguage,
        textChannelId: interaction.channelId,
        transcript,
        userId: interaction.user.id,
      });
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

    // Plays a native Discord soundboard sound in the channel the sidecar is listening in.
    // Handled entirely here (not via the music IPC) so it overlays the music without touching
    // Lavalink. Requires the bot to be connected, unmuted, and to hold the UseSoundboard perm.
    const playSoundboard = async (soundId: string, channelId: string): Promise<void> => {
      const channel = client.channels.cache.get(channelId);
      if (channel === undefined || channel.type !== ChannelType.GuildVoice) {
        logger.warn({ channelId }, "Cannot play soundboard: voice channel unavailable");
        return;
      }
      try {
        await channel.sendSoundboardSound({ soundId });
        logger.info({ soundId }, "Soundboard sound played");
      } catch (error) {
        logger.error({ err: error, soundId }, "Failed to play soundboard sound");
      }
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
            // TEMP (WI-015 calibration): the small PT Vosk model has no "gelado" in its
            // vocabulary, so neither the grammar nor open vocab can output it. Log the
            // open-vocab transcription to learn which in-vocabulary token(s) the model produces
            // for a spoken "gelado", so the trigger can be mapped to those. Remove once
            // calibrated.
            logger.info({ open: await result.transcribeOpen() }, "Open-vocab transcript (diag)");
          }
          // Soundboard triggers (WI-015) are self-contained: hearing the word fires the sound
          // with no wake word, handled locally so it overlays the music via Discord's native
          // soundboard. Unconfigured triggers fall through to normal command handling.
          const soundKey = matchSoundboardTrigger(result.transcript, activeLanguage);
          const soundId = soundKey === null ? undefined : config.voice.soundboardSounds[soundKey];
          if (soundId !== undefined) {
            await playSoundboard(soundId, channelId);
            return;
          }
          const transcript = await resolveTranscript(result, activeLanguage, true);
          if (transcript === null) {
            return;
          }
          const outcome = await forwardVoiceCommand(ipcConfig, {
            guildId,
            language: activeLanguage,
            textChannelId: channelId,
            transcript,
            userId,
          });
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
          // Unmuted: Discord rejects sending a soundboard sound (WI-015) from a self-muted
          // client. Listening is receive-side, so being unmuted does not affect it.
          selfMute: false,
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
        if (greetingPlayer !== undefined) {
          void greetingPlayer.play(joined, target).catch((error: unknown) => {
            logger.error({ err: error, channelId: target }, "Failed to play voice greeting");
          });
        }
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

  // Follow the language configured via /settings: poll now and on an interval, reloading the
  // model when it changes. Best-effort — a failed poll keeps the current language.
  void pollLanguage();
  const languagePoll = setInterval(() => void pollLanguage(), LANGUAGE_POLL_MS);
  languagePoll.unref();

  const shutdown = async (): Promise<void> => {
    clearInterval(languagePoll);
    wakeWord?.dispose();
    activeStt.close();
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
