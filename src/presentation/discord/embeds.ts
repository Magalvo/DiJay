import { EmbedBuilder } from "discord.js";

import type { PlaybackStateSnapshot, QueueSnapshot, Track } from "../../domain/music/track.js";
import { formatDuration, formatTrack, loopLabel, progressBar } from "./music-formatters.js";

export const BRAND_COLOR = 0x5865f2;
export const MUTED_COLOR = 0x747f8d;
export const SUCCESS_COLOR = 0x57f287;

export function baseEmbed(color: number = BRAND_COLOR): EmbedBuilder {
  return new EmbedBuilder().setColor(color).setFooter({ text: "DiJay" }).setTimestamp();
}

function requesterField(track: Track): { inline: boolean; name: string; value: string } {
  const value =
    track.requesterId === null || track.requesterId === undefined
      ? "Desconhecido"
      : `<@${track.requesterId}>`;
  return { inline: true, name: "Pedido por", value };
}

function applyThumbnail(embed: EmbedBuilder, track: Track): EmbedBuilder {
  if (track.artworkUrl !== null && track.artworkUrl !== undefined && track.artworkUrl !== "") {
    embed.setThumbnail(track.artworkUrl);
  }
  return embed;
}

export function trackAddedEmbed(track: Track, position: "next" | "now" | "queue"): EmbedBuilder {
  const label =
    position === "now"
      ? "A tocar agora"
      : position === "next"
        ? "A seguir na fila"
        : "Adicionada à fila";
  const embed = baseEmbed(SUCCESS_COLOR)
    .setAuthor({ name: `🎵 ${label}` })
    .setTitle(track.title)
    .addFields(
      { inline: true, name: "Autor", value: track.author },
      { inline: true, name: "Duração", value: formatDuration(track.durationMs, track.isStream) },
      requesterField(track),
    );
  if (track.uri !== null) {
    embed.setURL(track.uri);
  }
  return applyThumbnail(embed, track);
}

export function playlistAddedEmbed(name: string, count: number, failed = 0): EmbedBuilder {
  const embed = baseEmbed(SUCCESS_COLOR)
    .setAuthor({ name: "🎵 Playlist adicionada" })
    .setTitle(name)
    .setDescription(
      `**${count}** ${count === 1 ? "faixa adicionada" : "faixas adicionadas"} à fila${
        failed > 0 ? `\n${failed} indisponíveis` : ""
      }.`,
    );
  return embed;
}

export function nowPlayingEmbed(state: PlaybackStateSnapshot): EmbedBuilder {
  const track = state.current;
  if (track === null) {
    return baseEmbed(MUTED_COLOR).setTitle("DiJay").setDescription("Não há música em reprodução.");
  }

  const progress = track.isStream
    ? "🔴 LIVE"
    : `${progressBar(state.positionMs, track.durationMs)}\n\`${formatDuration(
        state.positionMs,
        false,
      )} / ${formatDuration(track.durationMs, false)}\``;

  const embed = baseEmbed()
    .setAuthor({ name: "🎧 A tocar agora" })
    .setTitle(track.title)
    .setDescription(`**${track.author}**\n${progress}`)
    .addFields(
      { inline: true, name: "Volume", value: `${state.volume}%` },
      { inline: true, name: "Loop", value: loopLabel(state.loopMode) },
      { inline: true, name: "Na fila", value: `${state.upcoming.length}` },
      requesterField(track),
    );
  if (track.uri !== null) {
    embed.setURL(track.uri);
  }
  return applyThumbnail(embed, track);
}

export function queueEmbed(snapshot: QueueSnapshot, maxTracks = 10): EmbedBuilder {
  if (snapshot.current === null) {
    return baseEmbed(MUTED_COLOR).setTitle("Fila").setDescription("A fila está vazia.");
  }

  const safeLimit = Math.max(1, maxTracks);
  const visible = snapshot.upcoming.slice(0, safeLimit);
  const omitted = snapshot.upcoming.length - visible.length;
  const lines = [
    `**A tocar agora**`,
    formatTrack(snapshot.current),
    ...(visible.length > 0
      ? [
          "",
          "**A seguir**",
          ...visible.map((track, index) => `\`${index + 1}.\` ${formatTrack(track)}`),
        ]
      : []),
  ];
  if (omitted > 0) {
    lines.push(`…e mais ${omitted}`);
  }

  const embed = baseEmbed()
    .setAuthor({ name: "📜 Fila de reprodução" })
    .setDescription(lines.join("\n").slice(0, 4_000));
  return applyThumbnail(embed, snapshot.current);
}

export function helpEmbed(): EmbedBuilder {
  return baseEmbed().setAuthor({ name: "🎶 DiJay" }).setTitle("Comandos disponíveis").addFields(
    {
      name: "▶️ Reprodução",
      value: "`/play` · `/pause` · `/resume` · `/skip` · `/stop` · `/seek`",
    },
    {
      name: "📜 Fila",
      value: "`/queue` · `/nowplaying` · `/shuffle` · `/remove` · `/clear` · `/loop`",
    },
    {
      name: "🎛️ Painel & som",
      value: "`/control` · `/volume`",
    },
    {
      name: "📁 Playlists & definições",
      value: "`/playlist` · `/settings`",
    },
    {
      name: "🛠️ Utilitários",
      value: "`/help` · `/ping`",
    },
  );
}
