import { join } from "node:path";

import { ChannelType, Client, Events, GatewayIntentBits, PermissionFlagsBits } from "discord.js";
import pino from "pino";
import { Poru } from "poru";

import { IdlePlayerManager } from "./application/music/idle-player-manager.js";
import { MusicService } from "./application/music/music-service.js";
import { PlaylistService } from "./application/playlists/playlist-service.js";
import { GuildAccessPolicy } from "./application/security/guild-access-policy.js";
import { GuildSettingsService } from "./application/settings/guild-settings-service.js";
import type { AppConfig } from "./config/env.js";
import { HealthState } from "./infrastructure/health/health-state.js";
import { startHealthServer } from "./infrastructure/health/health-server.js";
import { PoruMusicGateway } from "./infrastructure/lavalink/poru-music-gateway.js";
import { openAppDatabase } from "./infrastructure/sqlite/database.js";
import { SqliteGuildSettingsRepository } from "./infrastructure/sqlite/sqlite-guild-settings-repository.js";
import { SqlitePlaylistRepository } from "./infrastructure/sqlite/sqlite-playlist-repository.js";
import { CommandRegistry } from "./presentation/discord/command-registry.js";
import { createDiscordCommands } from "./presentation/discord/commands.js";
import { configureBotPresence } from "./presentation/discord/bot-presence.js";
import { createMusicButtonHandlers } from "./presentation/discord/music-buttons.js";

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
  const health = new HealthState();
  const database = openAppDatabase(join(config.dataDir, "dijay.sqlite"));
  let healthServer;
  try {
    healthServer = await startHealthServer(config.healthPort, health);
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
  const registry = new CommandRegistry(
    createDiscordCommands(music, settings, playlists),
    createMusicButtonHandlers(music),
    logger,
    accessPolicy,
  );

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

  client.on(Events.InteractionCreate, (interaction) => {
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
    void settingsRepository
      .get(player.guildId)
      .then(async (guildSettings) => {
        if (!guildSettings.announcementsEnabled) {
          return;
        }
        const channel = client.channels.cache.get(player.textChannel);
        if (
          channel?.type === ChannelType.GuildText &&
          client.user !== null &&
          channel
            .permissionsFor(client.user)
            ?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])
        ) {
          await channel.send(`🎧 A tocar agora: **${track.info.title}** — ${track.info.author}`);
        }
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
  });
  poru.on("queueEnd", (player) => {
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
  });

  let shuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    registry.stopAccepting();
    health.beginShutdown();
    idlePlayers.clear();
    logger.info({ signal }, "Shutting down");
    await Promise.allSettled([...poru.players.values()].map((player) => player.destroy()));
    await Promise.allSettled([...poru.nodes.values()].map((node) => node.disconnect()));
    health.setLavalinkReady(false);
    health.setDiscordReady(false);
    await client.destroy();
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
    await healthServer.close();
    database.close();
    throw error;
  }
}
