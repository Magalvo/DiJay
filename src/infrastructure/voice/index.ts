import { MessageFlags } from "discord.js";

import { VoiceCommandService } from "../../application/voice/voice-command-service.js";
import { voiceGrammar } from "../../domain/voice/voice-command.js";
import { playbackRequestFromInteraction } from "../../presentation/discord/interaction-context.js";
import { userFacingMusicError } from "../../presentation/discord/user-messages.js";
import type { CreateVoiceFeature } from "../../presentation/discord/voice-feature.js";
import { type CaptureResult, DiscordVoiceListener } from "./discord-voice-listener.js";
import { resolveTranscript } from "./resolve-transcript.js";
import { VoskSpeechToText } from "./vosk-speech-to-text.js";

const MAX_CAPTURE_MS = 6_000;

/**
 * Assembles the voice feature. Loaded dynamically from `bootstrap` only when voice is
 * enabled, so the native STT and audio packages stay optional.
 */
export const createVoiceFeature: CreateVoiceFeature = ({ language, logger, modelPath, music }) => {
  const stt = new VoskSpeechToText(modelPath, voiceGrammar(language));
  const listener = new DiscordVoiceListener(stt);
  const commands = new VoiceCommandService(music, language);

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

      let result: CaptureResult;
      try {
        result = await listener.capture({
          adapterCreator: interaction.guild.voiceAdapterCreator,
          channelId,
          guildId: request.guildId,
          maxDurationMs: MAX_CAPTURE_MS,
          userId: interaction.user.id,
        });
      } catch (error) {
        // Log the real failure (native lib, model path, timeout) but keep it off Discord.
        logger.error({ err: error, guildId: request.guildId }, "Voice capture failed");
        await interaction.editReply("⚠️ Não consegui captar a tua voz. Tenta novamente.");
        return;
      }

      if (result.transcript.trim().length === 0) {
        await interaction.editReply("🎙️ Não percebi nada. Tenta outra vez.");
        return;
      }

      const transcript = await resolveTranscript(result, language, false);
      if (transcript === null) {
        await interaction.editReply(`🎙️ "${result.transcript}"\n🤷 Não percebi o comando.`);
        return;
      }

      try {
        const outcome = await commands.handle(transcript, request);
        await interaction.editReply(`🎙️ "${transcript}"\n${outcome.message}`);
      } catch (error) {
        logger.error({ err: error, guildId: request.guildId }, "Voice command failed");
        await interaction.editReply(`🎙️ "${transcript}"\n⚠️ ${userFacingMusicError(error)}`);
      }
    },
    dispose() {
      stt.close();
    },
  };
};
