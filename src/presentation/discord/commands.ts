import type { ChatInputCommandInteraction } from "discord.js";

import type { MusicService } from "../../application/music/music-service.js";
import type { PlaylistService } from "../../application/playlists/playlist-service.js";
import type { GuildSettingsService } from "../../application/settings/guild-settings-service.js";
import type { LoopMode, QueuePlacement } from "../../domain/music/track.js";
import type { DiscordCommand } from "./command.js";
import { commandDataByName } from "./command-data.js";
import { buildControlPanel } from "./control-panel.js";
import { guildIdFromInteraction, playbackRequestFromInteraction } from "./interaction-context.js";
import { formatQueue, formatTrack, truncateDiscordMessage } from "./music-formatters.js";

function data(name: string) {
  const definition = commandDataByName.get(name);
  if (definition === undefined) {
    throw new Error(`Missing command definition: ${name}`);
  }
  return definition;
}

export function createDiscordCommands(
  music: MusicService,
  settings: GuildSettingsService,
  playlists: PlaylistService,
): readonly DiscordCommand[] {
  return [
    {
      data: data("play"),
      async execute(interaction) {
        const request = playbackRequestFromInteraction(interaction);
        const query = interaction.options.getString("query", true);
        const position = (interaction.options.getString("position") ?? "queue") as QueuePlacement;
        await interaction.deferReply();
        const result = await music.play({ ...request, position, query });
        const content =
          result.playlistName === null
            ? `🎵 Adicionada à fila: ${formatTrack(result.added[0]!)}`
            : `🎵 Playlist **${result.playlistName}** adicionada com ${result.added.length} faixas.`;
        await interaction.editReply(truncateDiscordMessage(content));
      },
    },
    simpleControl("pause", music, async (service, interaction) => {
      await service.pause(playbackRequestFromInteraction(interaction));
      return "⏸️ Reprodução pausada.";
    }),
    simpleControl("resume", music, async (service, interaction) => {
      await service.resume(playbackRequestFromInteraction(interaction));
      return "▶️ Reprodução retomada.";
    }),
    simpleControl("skip", music, async (service, interaction) => {
      const skipped = await service.skip(playbackRequestFromInteraction(interaction));
      return `⏭️ Saltada: ${formatTrack(skipped)}`;
    }),
    simpleControl("stop", music, async (service, interaction) => {
      await service.stop(playbackRequestFromInteraction(interaction));
      return "⏹️ Fila limpa. Até à próxima!";
    }),
    {
      data: data("queue"),
      async execute(interaction) {
        const snapshot = await music.getQueue(guildIdFromInteraction(interaction));
        await interaction.reply(snapshot === null ? "A fila está vazia." : formatQueue(snapshot));
      },
    },
    {
      data: data("nowplaying"),
      async execute(interaction) {
        const state = await music.getState(guildIdFromInteraction(interaction));
        await interaction.reply(
          state?.current === undefined || state.current === null
            ? "Não há música em reprodução."
            : `🎧 ${formatTrack(state.current)}`,
        );
      },
    },
    {
      data: data("control"),
      async execute(interaction) {
        const state = await music.getState(guildIdFromInteraction(interaction));
        await interaction.reply(buildControlPanel(state));
      },
    },
    {
      data: data("volume"),
      async execute(interaction) {
        const volume = interaction.options.getInteger("level", true);
        await music.setVolume({ ...playbackRequestFromInteraction(interaction), volume });
        await interaction.reply(`🔊 Volume alterado para **${volume}%**.`);
      },
    },
    {
      data: data("loop"),
      async execute(interaction) {
        const mode = interaction.options.getString("mode", true) as LoopMode;
        await music.setLoop({ ...playbackRequestFromInteraction(interaction), mode });
        await interaction.reply(`🔁 Loop: **${loopLabel(mode)}**.`);
      },
    },
    simpleControl("shuffle", music, async (service, interaction) => {
      const count = await service.shuffle(playbackRequestFromInteraction(interaction));
      return `🔀 ${count} músicas foram baralhadas.`;
    }),
    {
      data: data("remove"),
      async execute(interaction) {
        const position = interaction.options.getInteger("position", true);
        const removed = await music.remove({
          ...playbackRequestFromInteraction(interaction),
          position,
        });
        await interaction.reply(`🗑️ Removida: ${formatTrack(removed)}`);
      },
    },
    simpleControl("clear", music, async (service, interaction) => {
      const count = await service.clear(playbackRequestFromInteraction(interaction));
      return `🧹 ${count} músicas removidas da fila.`;
    }),
    {
      data: data("seek"),
      async execute(interaction) {
        const positionMs = parseSeek(interaction.options.getString("position", true));
        await music.seek({ ...playbackRequestFromInteraction(interaction), positionMs });
        await interaction.reply(`⏩ Posição alterada para **${formatSeek(positionMs)}**.`);
      },
    },
    {
      data: data("settings"),
      async execute(interaction) {
        await executeSettings(interaction, settings);
      },
    },
    {
      data: data("playlist"),
      async execute(interaction) {
        await executePlaylist(interaction, playlists);
      },
    },
    {
      data: data("help"),
      async execute(interaction) {
        await interaction.reply({
          content:
            "**DiJay privado**\n" +
            "`/play` · `/queue` · `/control` · `/nowplaying`\n" +
            "`/pause` · `/resume` · `/skip` · `/stop` · `/volume`\n" +
            "`/loop` · `/shuffle` · `/remove` · `/clear` · `/seek`\n" +
            "`/playlist` · `/settings` · `/ping`",
          ephemeral: true,
        });
      },
    },
    {
      data: data("ping"),
      async execute(interaction) {
        await interaction.reply(`🏓 Pong! ${interaction.client.ws.ping} ms`);
      },
    },
  ];
}

function simpleControl(
  name: string,
  music: MusicService,
  action: (service: MusicService, interaction: ChatInputCommandInteraction) => Promise<string>,
): DiscordCommand {
  return {
    data: data(name),
    async execute(interaction) {
      await interaction.reply(await action(music, interaction));
    },
  };
}

async function executeSettings(
  interaction: ChatInputCommandInteraction,
  settings: GuildSettingsService,
): Promise<void> {
  const guildId = guildIdFromInteraction(interaction);
  const subcommand = interaction.options.getSubcommand();
  if (subcommand === "volume") {
    const volume = interaction.options.getInteger("level", true);
    await settings.update(guildId, { defaultVolume: volume });
    await interaction.reply(`Volume inicial definido para **${volume}%**.`);
    return;
  }
  if (subcommand === "idle-timeout") {
    const seconds = interaction.options.getInteger("seconds", true);
    await settings.update(guildId, { idleTimeoutSeconds: seconds });
    await interaction.reply(`Timeout de inatividade definido para **${seconds}s**.`);
    return;
  }
  const enabled = interaction.options.getBoolean("enabled", true);
  await settings.update(guildId, { announcementsEnabled: enabled });
  await interaction.reply(`Anúncios de faixas ${enabled ? "ativados" : "desativados"}.`);
}

async function executePlaylist(
  interaction: ChatInputCommandInteraction,
  playlists: PlaylistService,
): Promise<void> {
  const guildId = guildIdFromInteraction(interaction);
  const subcommand = interaction.options.getSubcommand();
  const name = subcommand === "list" ? null : interaction.options.getString("name", true);

  if (subcommand === "create") {
    const playlist = await playlists.create(guildId, name!, interaction.user.id);
    await interaction.reply(`📁 Playlist **${playlist.name}** criada.`);
    return;
  }
  if (subcommand === "list") {
    const items = await playlists.list(guildId);
    await interaction.reply(
      items.length === 0
        ? "Ainda não existem playlists."
        : truncateDiscordMessage(
            `**Playlists**\n${items
              .map((playlist) => `• ${playlist.name} (${playlist.tracks.length})`)
              .join("\n")}`,
          ),
    );
    return;
  }
  if (subcommand === "show") {
    const playlist = await playlists.get(guildId, name!);
    await interaction.reply(
      truncateDiscordMessage(
        playlist.tracks.length === 0
          ? `A playlist **${playlist.name}** está vazia.`
          : `**${playlist.name}**\n${playlist.tracks
              .map(({ position, track }) => `${position}. ${formatTrack(track)}`)
              .join("\n")}`,
      ),
    );
    return;
  }
  if (subcommand === "add") {
    const item = await playlists.add(
      guildId,
      name!,
      interaction.options.getString("query", true),
      interaction.user.id,
    );
    await interaction.reply(`➕ Adicionada em ${item.position}: ${formatTrack(item.track)}`);
    return;
  }
  if (subcommand === "remove") {
    const item = await playlists.remove(
      guildId,
      name!,
      interaction.options.getInteger("position", true),
    );
    await interaction.reply(`🗑️ Removida: ${formatTrack(item.track)}`);
    return;
  }
  if (subcommand === "play") {
    await interaction.deferReply();
    const result = await playlists.play(playbackRequestFromInteraction(interaction), name!);
    await interaction.editReply(
      `🎵 ${result.added} faixas adicionadas${result.failed > 0 ? `; ${result.failed} indisponíveis` : ""}.`,
    );
    return;
  }
  await playlists.delete(guildId, name!);
  await interaction.reply(`Playlist **${name}** eliminada.`);
}

export function parseSeek(value: string): number {
  if (/^\d+$/.test(value)) {
    return Number(value) * 1_000;
  }
  const match = /^(\d+):([0-5]\d)$/.exec(value);
  if (match === null) {
    return -1;
  }
  return (Number(match[1]) * 60 + Number(match[2])) * 1_000;
}

function formatSeek(positionMs: number): string {
  const totalSeconds = Math.floor(positionMs / 1_000);
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

function loopLabel(mode: LoopMode): string {
  return mode === "track" ? "faixa" : mode === "queue" ? "fila" : "desligado";
}
