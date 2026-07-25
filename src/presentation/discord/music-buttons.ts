import type { DiscordButtonHandler } from "./command.js";
import { buildControlPanel, musicButtonIds } from "./control-panel.js";
import { guildIdFromInteraction, playbackRequestFromInteraction } from "./interaction-context.js";
import type { LivePanelManager } from "./live-panel.js";
import type { MusicService } from "../../application/music/music-service.js";
import type { LoopMode } from "../../domain/music/track.js";

export function createMusicButtonHandlers(
  music: MusicService,
  livePanel: LivePanelManager,
): readonly DiscordButtonHandler[] {
  return Object.values(musicButtonIds).map((customId) => ({
    customId,
    async execute(interaction) {
      // Refresh only re-renders the panel from current state, so it must not require the
      // clicker to be in a voice channel like the playback controls do.
      if (customId === musicButtonIds.refresh) {
        const guildId = guildIdFromInteraction(interaction);
        await interaction.deferUpdate();
        const state = await music.getState(guildId);
        await interaction.editReply(buildControlPanel(state));
        livePanel.register(guildId, interaction.channelId, interaction.message.id);
        return;
      }

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
      // The panel the user just interacted with becomes the live one for this guild.
      livePanel.register(request.guildId, interaction.channelId, interaction.message.id);
    },
  }));
}
