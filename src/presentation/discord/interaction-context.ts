import type { ButtonInteraction, ChatInputCommandInteraction } from "discord.js";

import type { PlaybackRequest } from "../../application/music/music-gateway.js";
import { MusicError } from "../../domain/music/music-error.js";

type GuildInteraction = ButtonInteraction | ChatInputCommandInteraction;

export function playbackRequestFromInteraction(interaction: GuildInteraction): PlaybackRequest {
  if (!interaction.inCachedGuild()) {
    throw new MusicError("VOICE_CHANNEL_REQUIRED", "This action requires a server.");
  }
  const voiceChannelId = interaction.member.voice.channelId;
  if (voiceChannelId === null) {
    throw new MusicError("VOICE_CHANNEL_REQUIRED", "Join a voice channel first.");
  }
  return {
    guildId: interaction.guildId,
    requesterId: interaction.user.id,
    textChannelId: interaction.channelId,
    voiceChannelId,
  };
}

export function guildIdFromInteraction(interaction: GuildInteraction): string {
  if (interaction.guildId === null) {
    throw new MusicError("UNAUTHORIZED_GUILD", "This action requires the private server.");
  }
  return interaction.guildId;
}
