import type { DiscordButtonHandler } from "./command.js";
import { buildControlPanel, musicButtonIds } from "./control-panel.js";
import { playbackRequestFromInteraction } from "./interaction-context.js";
import type { MusicService } from "../../application/music/music-service.js";
import type { LoopMode } from "../../domain/music/track.js";

export function createMusicButtonHandlers(music: MusicService): readonly DiscordButtonHandler[] {
  return Object.values(musicButtonIds).map((customId) => ({
    customId,
    async execute(interaction) {
      const request = playbackRequestFromInteraction(interaction);
      await interaction.deferUpdate();

      if (customId === musicButtonIds.toggle) {
        const state = await music.getState(request.guildId);
        if (state?.isPaused === true) {
          await music.resume(request);
        } else {
          await music.pause(request);
        }
      } else if (customId === musicButtonIds.skip) {
        await music.skip(request);
      } else if (customId === musicButtonIds.loop) {
        const state = await music.getState(request.guildId);
        const mode: LoopMode =
          state?.loopMode === "off" ? "track" : state?.loopMode === "track" ? "queue" : "off";
        await music.setLoop({ ...request, mode });
      } else if (customId === musicButtonIds.shuffle) {
        await music.shuffle(request);
      } else if (customId === musicButtonIds.stop) {
        await music.stop(request);
      }

      const state = await music.getState(request.guildId);
      await interaction.editReply(buildControlPanel(state));
    },
  }));
}
