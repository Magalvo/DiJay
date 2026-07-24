import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

import type { PlaybackStateSnapshot } from "../../domain/music/track.js";
import { MUTED_COLOR, baseEmbed, nowPlayingEmbed } from "./embeds.js";

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
  const embed = unavailable
    ? baseEmbed(MUTED_COLOR).setTitle("DiJay").setDescription("Não há música em reprodução.")
    : nowPlayingEmbed(state);

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
