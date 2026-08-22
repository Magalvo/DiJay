import { join } from "node:path";

import { ChannelType, Client, Events, GatewayIntentBits, PermissionFlagsBits } from "discord.js";
import pino from "pino";
import { Poru } from "poru";

import { IdlePlayerManager } from "./application/music/idle-player-manager.js";
import { MusicService } from "./application/music/music-service.js";
import {
  loadAudioActionManifest,
  type AudioActionManifest,
} from "./application/audio-actions/audio-action-manifest.js";
import { AudioActionService } from "./application/audio-actions/audio-action-service.js";
import { PlaylistService } from "./application/playlists/playlist-service.js";
import { GuildAccessPolicy } from "./application/security/guild-access-policy.js";
import { GuildSettingsService } from "./application/settings/guild-settings-service.js";
import { VoiceCommandService } from "./application/voice/voice-command-service.js";
import type { AppConfig } from "./config/env.js";
import { HealthState } from "./infrastructure/health/health-state.js";
import { startHealthServer } from "./infrastructure/health/health-server.js";
import { SelfHealWatchdog } from "./infrastructure/health/self-heal-watchdog.js";
import {
  startVoiceCommandServer,
  type VoiceCommandServer,
} from "./infrastructure/ipc/voice-command-server.js";
import { PoruMusicGateway } from "./infrastructure/lavalink/poru-music-gateway.js";
import { openAppDatabase } from "./infrastructure/sqlite/database.js";
import { SqliteGuildSettingsRepository } from "./infrastructure/sqlite/sqlite-guild-settings-repository.js";
import { SqlitePlaylistRepository } from "./infrastructure/sqlite/sqlite-playlist-repository.js";
import { CommandRegistry } from "./presentation/discord/command-registry.js";
import { createDiscordCommands } from "./presentation/discord/commands.js";
import { configureBotPresence } from "./presentation/discord/bot-presence.js";
import { LivePanelManager } from "./presentation/discord/live-panel.js";
import { createMusicButtonHandlers } from "./presentation/discord/music-buttons.js";
import type { CreateVoiceFeature, VoiceFeature } from "./presentation/discord/voice-feature.js";

export async function startBot(config: AppConfig): Promise<void> {
  const logger = pino(
    { level: config.logLevel },
    config.nodeEnv === "development"
      ? pino.transport({
          options: { colorize: true, translateTime: "SYS:standard" },
          target: "pino-pretty",
        })
      : undefined,
  );
  logger.info(
    { spotify: config.spotify.enabled },
    config.spotify.enabled
      ? "Spotify links enabled (anonymous token via spotify-tokener)"
      : "Spotify not configured; Spotify links will not resolve",
  );
  const health = new HealthState();

  // Self-heal backstop: if the bot is alive but stuck (discord/lavalink unhealthy) for longer
  // than the grace period, log a full diagnostic and exit so `restart: unless-stopped` recovers
  // it. `hasBeenHealthyOnce` keeps normal startup time (before the first successful boot) from
  // counting as "stuck" — only a REGRESSION after a successful boot triggers this.
  let hasBeenHealthyOnce = false;
  const selfHeal = new SelfHealWatchdog({
    gracePeriodMs: config.selfHeal.gracePeriodSeconds * 1_000,
    isHealthy: () => {
      const snapshot = health.snapshot();
      if (snapshot.healthy) {
        hasBeenHealthyOnce = true;
      }
      return !hasBeenHealthyOnce || snapshot.healthy;
    },
    onUnhealthy: (unhealthyForMs) => {
      logger.error(
        { checks: health.snapshot().checks, unhealthyForMs },
        "Self-heal: unhealthy past the grace period, exiting so the container restarts",
      );
      process.exit(1);
    },
  });
  if (config.selfHeal.enabled) {
    selfHeal.start();
  }

  let audioActions: AudioActionService | undefined;
  let audioActionManifest: AudioActionManifest | undefined;
  let audioActionsDir: string | undefined;
  if (config.audioActions.enabled) {
    try {
      audioActionManifest = await loadAudioActionManifest(config.audioActions.manifest);
      audioActionsDir = config.audioActions.dir;
    } catch (error) {
      logger.error({ err: error }, "Audio actions disabled: invalid manifest");
    }
  }
  const database = openAppDatabase(join(config.dataDir, "dijay.sqlite"));
  let healthServer;
  try {
    healthServer = await startHealthServer(
      config.healthPort,
      health,
      audioActionsDir === undefined ? {} : { audioActionsDir },
    );
  } catch (error) {
    database.close();
    throw error;
  }
  const settingsRepository = new SqliteGuildSettingsRepository(database, {
    defaultVolume: config.defaultVolume,
    idleTimeoutSeconds: config.idleTimeoutSeconds,
  });
  const playlistRepository = new SqlitePlaylistRepository(database);
  const settings = new GuildSettingsService(settingsRepository);
  const accessPolicy = new GuildAccessPolicy(config.discord.guildId);
  const idlePlayers = new IdlePlayerManager();
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
    // Track titles are untrusted (any search result can be queued): a title containing
    // `@everyone`/`@here` would otherwise ping the server when announced or echoed back.
    allowedMentions: { parse: [] },
  });
  const poru = new Poru(
    client,
    [
      {
        host: config.lavalink.host,
        name: "primary",
        password: config.lavalink.password,
        port: config.lavalink.port,
        secure: config.lavalink.secure,
      },
    ],
    {
      autoResume: true,
      clientName: "DiJay",
      defaultPlatform: "ytsearch",
      library: "discord.js",
      reconnectTimeout: 5_000,
      reconnectTries: 5,
    },
  );
  const music = new MusicService(new PoruMusicGateway(poru, settingsRepository));
  const playlists = new PlaylistService(playlistRepository, music);
  const livePanel = new LivePanelManager(client, music, logger);

  /**
   * Sends plain text to a guild text channel, staying silent when the channel is gone or the
   * bot cannot post there. Shared by the track announcements, the playback-failure notice and
   * the audio actions so all three degrade the same way.
   */
  const sendToTextChannel = async (channelId: string, content: string): Promise<void> => {
    const channel =
      client.channels.cache.get(channelId) ?? (await client.channels.fetch(channelId));
    if (
      channel?.type === ChannelType.GuildText &&
      client.user !== null &&
      channel
        .permissionsFor(client.user)
        ?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])
    ) {
      await channel.send(content);
    }
  };

  if (audioActionManifest !== undefined) {
    audioActions = new AudioActionService({
      actions: audioActionManifest.actions,
      baseUrl: config.audioActions.baseUrl,
      music,
      sendMessage: sendToTextChannel,
    });
    logger.info(
      { actions: audioActionManifest.actions.length, dir: config.audioActions.dir },
      "Audio actions enabled",
    );
  }

  let voiceFeature: VoiceFeature | undefined;
  if (config.voice.enabled) {
    try {
      // Variable specifier so the production build never pulls in the optional voice deps.
      const specifier = "./infrastructure/voice/index.js";
      const voiceModule = (await import(specifier)) as {
        readonly createVoiceFeature: CreateVoiceFeature;
      };
      voiceFeature = voiceModule.createVoiceFeature({
        language: config.voice.language,
        logger,
        modelPath: config.voice.modelPath,
        music,
      });
      logger.info({ modelPath: config.voice.modelPath }, "Voice recognition enabled");
    } catch (error) {
      // Log under `err` so pino prints the real message and stack (e.g. a missing native
      // library or model path), not an empty object.
      logger.error(
        { err: error },
        "Voice recognition could not start; install optional deps and a Vosk model",
      );
    }
  }

  const voice = voiceFeature;

  // Authenticated IPC endpoint that the voice-listener sidecar (WI-013) calls with a
  // recognized transcript. Enabled only when a shared secret is set; bound to the private
  // network, never published.
  let voiceCommandServer: VoiceCommandServer | undefined;
  if (config.voiceIpc.enabled) {
    const voiceCommands = new VoiceCommandService(music, config.voice.language);
    try {
      voiceCommandServer = await startVoiceCommandServer(
        config.voiceIpc.port,
        {
          secret: config.voiceIpc.secret,
          currentSettings: async (guildId) => {
            const guildSettings = await settings.get(guildId);
            return {
              commandsEnabled: guildSettings.voiceCommandsEnabled,
              joinGreetingEnabled: guildSettings.voiceJoinGreetingEnabled,
              language: guildSettings.voiceLanguage,
              soundsEnabled: guildSettings.voiceSoundsEnabled,
            };
          },
          handle: (transcript, request, language) =>
            voiceCommands.handle(transcript, request, language),
          isAllowed: (guildId) => accessPolicy.isAllowed(guildId),
          resolveRequest: (guildId, userId, textChannelId) => {
            const voiceChannelId =
              client.guilds.cache.get(guildId)?.members.cache.get(userId)?.voice.channelId ?? null;
            return voiceChannelId === null
              ? null
              : { guildId, requesterId: userId, textChannelId, voiceChannelId };
          },
        },
        logger,
      );
      logger.info({ port: config.voiceIpc.port }, "Voice command IPC server listening");
    } catch (error) {
      logger.error({ err: error }, "Voice command IPC server could not start");
    }
  }

  const registry = new CommandRegistry(
    createDiscordCommands(
      music,
      settings,
      playlists,
      livePanel,
      voice === undefined ? undefined : (interaction) => voice.handleListen(interaction),
    ),
    createMusicButtonHandlers(music, livePanel),
    logger,
    accessPolicy,
  );

  // Live gateway tracking for self-heal: discord.js resumes/reconnects on its own in most
  // cases, but a stuck/zombied connection (open socket, no data flowing) is exactly what the
  // self-heal watchdog below exists to catch, and it needs live disconnect signals to do that —
  // ClientReady alone only fires once and never reflects a later live disconnect.
  client.on(Events.ShardDisconnect, (event, shardId) => {
    health.setDiscordReady(false);
    logger.warn({ code: event.code, shardId }, "Discord shard disconnected");
  });
  client.on(Events.ShardReconnecting, (shardId) => {
    logger.info({ shardId }, "Discord shard reconnecting");
  });
  client.on(Events.ShardResume, (shardId) => {
    health.setDiscordReady(true);
    logger.info({ shardId }, "Discord shard resumed");
  });
  client.on(Events.ShardReady, (shardId) => {
    health.setDiscordReady(true);
    logger.info({ shardId }, "Discord shard ready");
  });

  client.once(Events.ClientReady, (readyClient) => {
    health.setDiscordReady(true);
    configureBotPresence(readyClient.user, config.botStatusText);
    for (const guild of readyClient.guilds.cache.values()) {
      if (!accessPolicy.isAllowed(guild.id)) {
        void guild.leave().catch((error: unknown) => {
          logger.warn({ error, guildId: guild.id }, "Could not leave unauthorized guild");
        });
      }
    }
    void poru
      .init()
      .then(() => {
        logger.info(
          { guilds: readyClient.guilds.cache.size, user: readyClient.user.tag },
          "DiJay is ready",
        );
      })
      .catch((error: unknown) => {
        logger.error({ error }, "Could not initialize Lavalink");
      });
  });

  client.on(Events.GuildCreate, (guild) => {
    if (!accessPolicy.isAllowed(guild.id)) {
      void guild.leave().catch((error: unknown) => {
        logger.warn({ error, guildId: guild.id }, "Could not leave unauthorized guild");
      });
    }
  });

  client.on(Events.VoiceStateUpdate, (oldState, newState) => {
    if (
      audioActions === undefined ||
      newState.member?.user.bot === true ||
      !accessPolicy.isAllowed(newState.guild.id) ||
      newState.channelId === null ||
      newState.channelId === oldState.channelId
    ) {
      return;
    }
    const guildId = newState.guild.id;
    const userId = newState.id;
    const voiceChannelId = newState.channelId;
    void settings
      .get(guildId)
      .then((guildSettings) => {
        if (!guildSettings.voiceJoinGreetingEnabled) {
          return undefined;
        }
        return audioActions.handleVoiceMemberJoin({ guildId, userId, voiceChannelId });
      })
      .catch((error: unknown) => {
        logger.warn({ error, guildId }, "Audio action failed");
      });
  });

  client.on(Events.InteractionCreate, (interaction) => {
    if (interaction.isAutocomplete()) {
      void registry.autocomplete(interaction).catch((error: unknown) => {
        logger.error({ error }, "Could not respond to autocomplete");
      });
      return;
    }
    if (!interaction.isChatInputCommand() && !interaction.isButton()) {
      return;
    }
    void registry.execute(interaction).catch((error: unknown) => {
      logger.error({ error }, "Could not send the interaction response");
    });
  });

  poru.on("nodeConnect", (node) => {
    health.setLavalinkReady(true);
    logger.info({ node: node.name }, "Lavalink node connected");
  });
  poru.on("nodeDisconnect", (node, event) => {
    health.setLavalinkReady([...poru.nodes.values()].some((candidate) => candidate.isConnected));
    logger.warn({ event, node: node.name }, "Lavalink node disconnected");
  });
  poru.on("nodeError", (node, error) => {
    logger.error({ error, node: node.name }, "Lavalink node error");
  });
  poru.on("trackStart", (player, track) => {
    idlePlayers.cancel(player.guildId);
    void livePanel.refresh(player.guildId);
    void settingsRepository
      .get(player.guildId)
      .then(async (guildSettings) => {
        if (!guildSettings.announcementsEnabled) {
          return;
        }
        await sendToTextChannel(
          player.textChannel,
          `🎧 A tocar agora: **${track.info.title}** — ${track.info.author}`,
        );
      })
      .catch((error: unknown) => {
        logger.warn({ error, guildId: player.guildId }, "Could not announce the track");
      });
  });
  poru.on("trackError", (player, track, error) => {
    logger.error(
      { error, guildId: player.guildId, track: track.info.title },
      "Track playback failed",
    );
    // Poru skips to the next track on a TrackException/TrackStuck event, so without this the
    // queue drains in silence and the bot just sits in the channel: /play already answered
    // "added to the queue" long before the source failed. Deliberately not gated on
    // `announcementsEnabled` - that toggle silences the now-playing notices, not failures.
    void sendToTextChannel(
      player.textChannel,
      `⚠️ Não consegui reproduzir **${track.info.title}**. A passar à seguinte.`,
    ).catch((sendError: unknown) => {
      logger.warn(
        { error: sendError, guildId: player.guildId },
        "Could not report the playback failure",
      );
    });
  });
  poru.on("queueEnd", (player) => {
    void livePanel.refresh(player.guildId);
    void settingsRepository
      .get(player.guildId)
      .then((guildSettings) => {
        idlePlayers.schedule(player.guildId, guildSettings.idleTimeoutSeconds, async () => {
          const current = poru.get(player.guildId);
          if (current !== null && current.currentTrack === null && current.queue.size === 0) {
            await current.destroy();
          }
        });
      })
      .catch((error: unknown) => {
        logger.warn({ error, guildId: player.guildId }, "Could not schedule idle cleanup");
      });
  });
  poru.on("playerDestroy", (player) => {
    idlePlayers.cancel(player.guildId);
    void livePanel.refresh(player.guildId).finally(() => {
      livePanel.clear(player.guildId);
    });
  });

  let shuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    selfHeal.stop();
    registry.stopAccepting();
    health.beginShutdown();
    idlePlayers.clear();
    voice?.dispose();
    logger.info({ signal }, "Shutting down");
    await Promise.allSettled([...poru.players.values()].map((player) => player.destroy()));
    await Promise.allSettled([...poru.nodes.values()].map((node) => node.disconnect()));
    health.setLavalinkReady(false);
    health.setDiscordReady(false);
    await client.destroy();
    if (voiceCommandServer !== undefined) {
      await voiceCommandServer.close();
    }
    await healthServer.close();
    database.close();
  };

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      void shutdown(signal);
    });
  }

  try {
    await client.login(config.discord.token);
  } catch (error) {
    health.beginShutdown();
    await client.destroy();
    if (voiceCommandServer !== undefined) {
      await voiceCommandServer.close();
    }
    await healthServer.close();
    database.close();
    throw error;
  }
}
