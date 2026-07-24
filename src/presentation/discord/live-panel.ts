import type { Client } from "discord.js";

import type { MusicService } from "../../application/music/music-service.js";
import type { AppLogger } from "./command.js";
import { buildControlPanel } from "./control-panel.js";

interface PanelRef {
  readonly channelId: string;
  readonly messageId: string;
}

/**
 * Keeps a single self-updating control panel message per guild. The panel is
 * re-rendered from the current playback state whenever playback changes, so it
 * stays live without a polling timer.
 */
export class LivePanelManager {
  private readonly panels = new Map<string, PanelRef>();

  public constructor(
    private readonly client: Client,
    private readonly music: MusicService,
    private readonly logger: AppLogger,
  ) {}

  public register(guildId: string, channelId: string, messageId: string): void {
    this.panels.set(guildId, { channelId, messageId });
  }

  public clear(guildId: string): void {
    this.panels.delete(guildId);
  }

  public async refresh(guildId: string): Promise<void> {
    const ref = this.panels.get(guildId);
    if (ref === undefined) {
      return;
    }
    try {
      const channel = await this.client.channels.fetch(ref.channelId);
      if (channel === null || !channel.isTextBased()) {
        this.panels.delete(guildId);
        return;
      }
      const state = await this.music.getState(guildId);
      await channel.messages.edit(ref.messageId, buildControlPanel(state));
    } catch (error) {
      // The panel message was deleted or is no longer reachable: stop tracking it.
      this.panels.delete(guildId);
      this.logger.error({ error, guildId }, "Could not refresh the live control panel");
    }
  }
}
