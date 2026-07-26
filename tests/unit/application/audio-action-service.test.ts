import { describe, expect, it, vi } from "vitest";

import { AudioActionService } from "../../../src/application/audio-actions/audio-action-service.js";
import type { MusicService } from "../../../src/application/music/music-service.js";

function musicMock(enqueued = true) {
  return {
    playSystemAudioAction: vi.fn().mockResolvedValue({
      enqueued,
      textChannelId: enqueued ? "text-1" : null,
      voiceChannelId: enqueued ? "voice-1" : null,
    }),
  } as unknown as MusicService & { playSystemAudioAction: ReturnType<typeof vi.fn> };
}

describe("AudioActionService", () => {
  it("plays and announces a configured voice-channel greeting", async () => {
    const music = musicMock();
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const service = new AudioActionService({
      actions: [
        {
          cooldownSeconds: 86_400,
          file: "greeting.mp3",
          id: "voice_join_greeting",
          message: "Viva, sou o DJ do server.",
          trigger: "voice_member_join",
        },
      ],
      baseUrl: "http://bot:3000/audio-actions",
      music,
      sendMessage,
    });

    await service.handleVoiceMemberJoin({
      guildId: "guild-1",
      userId: "user-1",
      voiceChannelId: "voice-1",
    });

    expect(music.playSystemAudioAction).toHaveBeenCalledWith({
      guildId: "guild-1",
      position: "next",
      query: "http://bot:3000/audio-actions/greeting.mp3",
      requesterId: "audio-action:voice_join_greeting",
      targetVoiceChannelId: "voice-1",
    });
    expect(sendMessage).toHaveBeenCalledWith("text-1", "Viva, sou o DJ do server.");
  });

  it("does nothing when no active player can receive the clip", async () => {
    const music = musicMock(false);
    const sendMessage = vi.fn();
    const service = new AudioActionService({
      actions: [
        {
          cooldownSeconds: 60,
          file: "greeting.mp3",
          id: "voice_join_greeting",
          message: "Viva",
          trigger: "voice_member_join",
        },
      ],
      baseUrl: "http://bot:3000/audio-actions",
      music,
      sendMessage,
    });

    await service.handleVoiceMemberJoin({
      guildId: "guild-1",
      userId: "user-1",
      voiceChannelId: "voice-1",
    });

    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("applies the per-user cooldown after a successful greeting", async () => {
    let now = 1_000;
    const music = musicMock();
    const service = new AudioActionService({
      actions: [
        {
          cooldownSeconds: 60,
          file: "greeting.mp3",
          id: "voice_join_greeting",
          message: "Viva",
          trigger: "voice_member_join",
        },
      ],
      baseUrl: "http://bot:3000/audio-actions",
      music,
      now: () => now,
      sendMessage: vi.fn().mockResolvedValue(undefined),
    });

    await service.handleVoiceMemberJoin({
      guildId: "guild-1",
      userId: "user-1",
      voiceChannelId: "voice-1",
    });
    now += 30_000;
    await service.handleVoiceMemberJoin({
      guildId: "guild-1",
      userId: "user-1",
      voiceChannelId: "voice-1",
    });
    now += 31_000;
    await service.handleVoiceMemberJoin({
      guildId: "guild-1",
      userId: "user-1",
      voiceChannelId: "voice-1",
    });

    expect(music.playSystemAudioAction).toHaveBeenCalledTimes(2);
  });
});
