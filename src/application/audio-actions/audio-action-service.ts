import type { MusicService } from "../music/music-service.js";
import type { QueuePlacement } from "../../domain/music/track.js";
import type { AudioActionDefinition } from "./audio-action-manifest.js";

export interface VoiceMemberJoinEvent {
  readonly guildId: string;
  readonly userId: string;
  readonly voiceChannelId: string;
}

export interface AudioActionServiceDeps {
  readonly actions: readonly AudioActionDefinition[];
  readonly baseUrl: string;
  readonly music: Pick<MusicService, "playSystemAudioAction">;
  readonly now?: () => number;
  readonly sendMessage: (channelId: string, message: string) => Promise<void>;
}

const clipPlacement: QueuePlacement = "next";

export class AudioActionService {
  private readonly cooldowns = new Map<string, number>();
  private readonly now: () => number;
  private readonly baseUrl: string;

  public constructor(private readonly deps: AudioActionServiceDeps) {
    this.now = deps.now ?? Date.now;
    this.baseUrl = deps.baseUrl.replace(/\/+$/, "");
  }

  public async handleVoiceMemberJoin(event: VoiceMemberJoinEvent): Promise<void> {
    for (const action of this.deps.actions) {
      if (action.trigger !== "voice_member_join" || this.isCoolingDown(action, event)) {
        continue;
      }
      const result = await this.deps.music.playSystemAudioAction({
        guildId: event.guildId,
        position: clipPlacement,
        query: this.clipUrl(action.file),
        requesterId: `audio-action:${action.id}`,
        targetVoiceChannelId: event.voiceChannelId,
      });
      if (!result.enqueued || result.textChannelId === null) {
        continue;
      }
      this.cooldowns.set(
        this.cooldownKey(action, event),
        this.now() + action.cooldownSeconds * 1000,
      );
      await this.deps.sendMessage(result.textChannelId, action.message);
    }
  }

  private isCoolingDown(action: AudioActionDefinition, event: VoiceMemberJoinEvent): boolean {
    return (this.cooldowns.get(this.cooldownKey(action, event)) ?? 0) > this.now();
  }

  private cooldownKey(action: AudioActionDefinition, event: VoiceMemberJoinEvent): string {
    return `${event.guildId}:${event.userId}:${action.id}`;
  }

  private clipUrl(file: string): string {
    return `${this.baseUrl}/${file.split(/[\\/]/).map(encodeURIComponent).join("/")}`;
  }
}
