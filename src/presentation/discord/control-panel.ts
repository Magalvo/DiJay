import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";

import type { PlaybackStateSnapshot } from "../../domain/music/track.js";
import { formatDuration } from "./music-formatters.js";

export const musicButtonIds = {
  loop: "music:loop",
  refresh: "music:refresh",
  shuffle: "music:shuffle",
  skip: "music:skip",
  stop: "music:stop",
  toggle: "music:toggle",
} as const;

export function buildControlPanel(state: PlaybackStateSnapshot | null) {
  const unavailable = state?.current === undefined || state.current === null;
  const embed = new EmbedBuilder().setColor(unavailable ? 0x747f8d : 0x5865f2);

  if (unavailable) {
    embed.setTitle("DiJay").setDescription("Não há música em reprodução.");
  } else {
    const progress = state.current.isStream
      ? "LIVE"
      : `${progressBar(state.positionMs, state.current.durationMs)} ${formatDuration(
          state.positionMs,
          false,
        )} / ${formatDuration(state.current.durationMs, false)}`;
    embed
      .setTitle(state.current.title)
      .setDescription(`${state.current.author}\n${progress}`)
      .addFields(
        { inline: true, name: "Volume", value: `${state.volume}%` },
        { inline: true, name: "Loop", value: loopLabel(state.loopMode) },
        { inline: true, name: "Fila", value: `${state.upcoming.length}` },
        {
          inline: true,
          name: "Pedido por",
          value:
            state.current.requesterId === null || state.current.requesterId === undefined
              ? "Desconhecido"
              : `<@${state.current.requesterId}>`,
        },
      );
    if (state.current.uri !== null) {
      embed.setURL(state.current.uri);
    }
  }

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(musicButtonIds.toggle)
      .setEmoji(state?.isPaused === true ? "▶️" : "⏸️")
      .setLabel(state?.isPaused === true ? "Retomar" : "Pausar")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(unavailable),
    new ButtonBuilder()
      .setCustomId(musicButtonIds.skip)
      .setEmoji("⏭️")
      .setLabel("Saltar")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(unavailable),
    new ButtonBuilder()
      .setCustomId(musicButtonIds.loop)
      .setEmoji("🔁")
      .setLabel("Loop")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(unavailable),
    new ButtonBuilder()
      .setCustomId(musicButtonIds.shuffle)
      .setEmoji("🔀")
      .setLabel("Baralhar")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(unavailable || (state?.upcoming.length ?? 0) < 2),
    new ButtonBuilder()
      .setCustomId(musicButtonIds.stop)
      .setEmoji("⏹️")
      .setLabel("Parar")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(unavailable),
  );
  const refreshRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(musicButtonIds.refresh)
      .setEmoji("🔄")
      .setLabel("Atualizar")
      .setStyle(ButtonStyle.Secondary),
  );
  return { components: [row, refreshRow], embeds: [embed] };
}

function progressBar(positionMs: number, durationMs: number): string {
  const slots = 12;
  const ratio = durationMs <= 0 ? 0 : Math.min(1, Math.max(0, positionMs / durationMs));
  const filled = Math.round(ratio * slots);
  return `${"▬".repeat(filled)}🔘${"▬".repeat(slots - filled)}`;
}

function loopLabel(mode: PlaybackStateSnapshot["loopMode"]): string {
  return mode === "track" ? "Faixa" : mode === "queue" ? "Fila" : "Desligado";
}
