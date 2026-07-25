import { MessageFlags } from "discord.js";

import { VoiceCommandService } from "../../application/voice/voice-command-service.js";
import { VOICE_GRAMMAR } from "../../domain/voice/voice-command.js";
import { playbackRequestFromInteraction } from "../../presentation/discord/interaction-context.js";
import type { CreateVoiceFeature } from "../../presentation/discord/voice-feature.js";
import { DiscordVoiceListener } from "./discord-voice-listener.js";
import { VoskSpeechToText } from "./vosk-speech-to-text.js";

const MAX_CAPTURE_MS = 6_000;

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Assembles the voice feature. Loaded dynamically from `bootstrap` only when voice is
 * enabled, so the native STT and audio packages stay optional.
 */
export const createVoiceFeature: CreateVoiceFeature = ({ logger, modelPath, music }) => {
  const stt = new VoskSpeechToText(modelPath, VOICE_GRAMMAR);
  const listener = new DiscordVoiceListener(stt);
  const commands = new VoiceCommandService(music);

  return {
    async handleListen(interaction) {
      if (!interaction.inCachedGuild()) {
        return;
      }
      const request = playbackRequestFromInteraction(interaction);
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
          guildId: request.guildId,
          maxDurationMs: MAX_CAPTURE_MS,
          userId: interaction.user.id,
        });
      } catch (error) {
        logger.error({ err: error, guildId: request.guildId }, "Voice capture failed");
        await interaction.editReply(
          `⚠️ Falha ao captar/transcrever a voz: ${describeError(error)}`,
        );
        return;
      }

      if (transcript.trim().length === 0) {
        await interaction.editReply("🎙️ Não percebi nada. Tenta outra vez.");
        return;
      }

      try {
        const outcome = await commands.handle(transcript, request);
        await interaction.editReply(`🎙️ "${transcript}"\n${outcome.message}`);
      } catch (error) {
        logger.error({ err: error, guildId: request.guildId }, "Voice command failed");
        await interaction.editReply(`🎙️ "${transcript}"\n⚠️ ${describeError(error)}`);
      }
    },
    dispose() {
      stt.close();
    },
  };
};
