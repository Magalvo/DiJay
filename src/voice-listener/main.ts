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
  fetchVoiceListenerSettings,
  forwardVoiceCommand,
} from "../infrastructure/ipc/voice-command-client.js";
import {
  type CaptureResult,
  DiscordVoiceListener,
} from "../infrastructure/voice/discord-voice-listener.js";
import {
  type AudioActionDefinition,
  loadAudioActionManifest,
} from "../application/audio-actions/audio-action-manifest.js";
import { resolveTranscript } from "../infrastructure/voice/resolve-transcript.js";
import { SelfHealWatchdog } from "../infrastructure/health/self-heal-watchdog.js";
import { VoskSpeechToText } from "../infrastructure/voice/vosk-speech-to-text.js";
import { VoiceClipPlayer } from "./voice-clip-player.js";
import { VoiceListenerAudioActions } from "./voice-listener-audio-actions.js";

const MAX_CAPTURE_MS = 6_000;
const READY_TIMEOUT_MS = 10_000;
// Per-user gap after a capture before the same speaker can trigger another, so one utterance
// is not processed twice.
const WAKE_COOLDOWN_MS = 1_500;
// How often the listener asks the main bot for the current voice settings (language and the
// two voice toggles, WI-016 / follow-up), so a change made via /settings takes effect within
// one interval without a restart.
const SETTINGS_POLL_MS = 15_000;

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

  let audioActions: readonly AudioActionDefinition[] = [];
  if (config.audioActions.enabled) {
    try {
      audioActions = (await loadAudioActionManifest(config.audioActions.manifest)).actions;
      logger.info(
        { actions: audioActions.length, manifest: config.audioActions.manifest },
        "Voice listener audio actions loaded",
      );
    } catch (error) {
      logger.error(
        { err: error, manifest: config.audioActions.manifest },
        "Voice listener audio actions disabled: invalid manifest",
      );
    }
  }

  const clipPlayer = new VoiceClipPlayer({
    createAudioResource,
    createPlayer: createAudioPlayer,
    subscribe: (connection, player) => {
      (connection as VoiceConnection).subscribe(player as ReturnType<typeof createAudioPlayer>);
    },
  });
  const voiceAudioActions = new VoiceListenerAudioActions({
    actions: audioActions,
    audioActionsDir: config.audioActions.dir,
    clipPlayer,
    legacyGreeting: config.voice.greeting,
  });

  // The active recognition language and its Vosk model can change at runtime (WI-016). Both
  // per-language model paths must exist on disk to switch; the initial language uses the model
  // guaranteed by env (VOICE_STT_MODEL_PATH maps to VOICE_LANGUAGE).
  const modelPaths = config.voice.modelPaths;
  const loadStt = (language: VoiceLanguage): VoskSpeechToText => {
    const path = modelPaths[language];
    if (path === null) {
      throw new Error(`No Vosk model path configured for language "${language}"`);
    }
    return new VoskSpeechToText(
      path,
      voiceGrammar(language, voiceAudioActions.extraGrammar(language)),
    );
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

  // The two independent voice toggles (a "/settings voice-commands"/"voice-sounds" follow-up to
  // WI-016): default to enabled so a poll failure or a not-yet-completed first poll never
  // silently disables a feature nobody asked to turn off.
  let commandsEnabled = true;
  let soundsEnabled = true;

  const ipcConfig = { secret: config.voiceIpc.secret, url: config.voiceIpc.url };
  const pollSettings = async (): Promise<void> => {
    try {
      const settings = await fetchVoiceListenerSettings(ipcConfig, config.discord.guildId);
      switchLanguage(settings.language);
      commandsEnabled = settings.commandsEnabled;
      soundsEnabled = settings.soundsEnabled;
    } catch (error) {
      logger.debug({ err: error }, "Voice settings poll failed");
    }
  };

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
  });
  const listenCommand = new SlashCommandBuilder()
    .setName("listen")
    .setDescription("Ouve um comando de voz durante alguns segundos.")
    .setContexts(InteractionContextType.Guild)
    .toJSON();

  // Live gateway tracking for self-heal: discord.js resumes/reconnects on its own in most
  // cases, but a stuck/zombied connection is exactly what the watchdog below exists to catch.
  let discordReady = false;
  client.on(Events.ShardDisconnect, (event, shardId) => {
    discordReady = false;
    logger.warn({ code: event.code, shardId }, "Discord shard disconnected");
  });
  client.on(Events.ShardReconnecting, (shardId) => {
    logger.info({ shardId }, "Discord shard reconnecting");
  });
  client.on(Events.ShardResume, (shardId) => {
    discordReady = true;
    logger.info({ shardId }, "Discord shard resumed");
  });
  client.on(Events.ShardReady, (shardId) => {
    discordReady = true;
    logger.info({ shardId }, "Discord shard ready");
  });

  // Self-heal backstop: if the gateway connection is stuck for longer than the grace period,
  // log a full diagnostic and exit so `restart: unless-stopped` recovers it.
  // `hasBeenHealthyOnce` keeps normal startup time from counting as "stuck" — only a
  // regression after a successful boot triggers this.
  let hasBeenHealthyOnce = false;
  const selfHeal = new SelfHealWatchdog({
    gracePeriodMs: config.selfHeal.gracePeriodSeconds * 1_000,
    isHealthy: () => {
      if (discordReady) {
        hasBeenHealthyOnce = true;
      }
      return !hasBeenHealthyOnce || discordReady;
    },
    onUnhealthy: (unhealthyForMs) => {
      logger.error(
        { discordReady, unhealthyForMs },
        "Self-heal: unhealthy past the grace period, exiting so the container restarts",
      );
      process.exit(1);
    },
  });
  if (config.selfHeal.enabled) {
    selfHeal.start();
  }

  client.once(Events.ClientReady, (ready) => {
    discordReady = true;
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
    if (!commandsEnabled) {
      // /listen exists only to issue playback commands, so the voice-commands toggle (WI-016
      // follow-up) applies to it directly, unlike voiceSoundsEnabled which only affects
      // hands-free mode's spoken-phrase/soundboard triggers.
      await interaction.reply({
        content: "🔇 Comandos de voz estão desativados neste servidor.",
        flags: MessageFlags.Ephemeral,
      });
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
      const activeConnection = connection;
      const channelId = connectedChannelId;
      if (activeConnection === undefined || channelId === undefined) {
        return;
      }
      const receiver = activeConnection.receiver;
      if (busy.has(userId) || Date.now() < (cooldownUntil.get(userId) ?? 0)) {
        return;
      }
      busy.add(userId);
      void listener
        .captureUtterance(receiver, userId, MAX_CAPTURE_MS)
        .then(async (result) => {
          cooldownUntil.set(userId, Date.now() + WAKE_COOLDOWN_MS);

          // Sound/soundboard triggers (WI-015, "voice-sounds" toggle): spoken-phrase clips and
          // the native Discord soundboard are self-contained, no wake word required, so gate
          // both together and independently of the voice-commands toggle below.
          if (soundsEnabled) {
            if (
              await voiceAudioActions.handleSpokenPhrase({
                channelId,
                connection: activeConnection,
                guildId,
                language: activeLanguage,
                transcript: result.transcript,
                userId,
              })
            ) {
              return;
            }
            const soundKey = matchSoundboardTrigger(result.transcript, activeLanguage);
            const soundId = soundKey === null ? undefined : config.voice.soundboardSounds[soundKey];
            if (soundId !== undefined) {
              await playSoundboard(soundId, channelId);
              return;
            }
          }

          // Wake-word "dj <command>" playback control ("voice-commands" toggle).
          if (!commandsEnabled) {
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
        void voiceAudioActions
          .handleListenerJoin({ channelId: target, connection: joined, guildId })
          .catch((error: unknown) => {
            logger.error(
              { err: error, channelId: target },
              "Failed to play voice listener audio action",
            );
          });
        logger.info({ channelId: target }, "Hands-free wake-word listening in channel");
      } finally {
        reconciling = false;
      }
    };

    client.on(Events.VoiceStateUpdate, (oldState, newState) => {
      const activeConnection = connection;
      const channelId = connectedChannelId;
      const member = newState.member;
      if (
        activeConnection !== undefined &&
        channelId !== undefined &&
        newState.guild.id === guildId &&
        member !== null &&
        !member.user.bot &&
        oldState.channelId !== newState.channelId &&
        newState.channelId === channelId
      ) {
        void voiceAudioActions
          .handleListenerMemberJoin({
            channelId,
            connection: activeConnection,
            guildId,
            userId: member.id,
          })
          .catch((error: unknown) => {
            logger.error(
              { err: error, channelId, userId: member.id },
              "Failed to play voice listener member join audio action",
            );
          });
      }
      void reconcile();
    });
    client.once(Events.ClientReady, () => {
      void reconcile();
    });

    return { dispose: leave };
  }

  const wakeWord = config.voice.wakeWordEnabled ? setupWakeWordListening() : undefined;

  // Follow the settings configured via /settings: poll now and on an interval, reloading the
  // model when the language changes and updating the two voice toggles. Best-effort — a failed
  // poll keeps whatever was last known.
  void pollSettings();
  const settingsPoll = setInterval(() => void pollSettings(), SETTINGS_POLL_MS);
  settingsPoll.unref();

  const shutdown = async (): Promise<void> => {
    clearInterval(settingsPoll);
    selfHeal.stop();
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
