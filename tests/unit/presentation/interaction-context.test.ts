import type { ChatInputCommandInteraction } from "discord.js";
import { describe, expect, it } from "vitest";

import {
  guildIdFromInteraction,
  playbackRequestFromInteraction,
} from "../../../src/presentation/discord/interaction-context.js";

interface InteractionOptions {
  readonly channelId?: string;
  readonly guildId?: string | null;
  readonly inGuild?: boolean;
  readonly userId?: string;
  readonly voiceChannelId?: string | null;
}

function interaction(options: InteractionOptions = {}): ChatInputCommandInteraction {
  const {
    channelId = "text-1",
    guildId = "guild-1",
    inGuild = true,
    userId = "user-1",
    voiceChannelId = "voice-1",
  } = options;

  return {
    channelId,
    guildId,
    inCachedGuild: () => inGuild,
    member: { voice: { channelId: voiceChannelId } },
    user: { id: userId },
  } as unknown as ChatInputCommandInteraction;
}

describe("playbackRequestFromInteraction", () => {
  it("builds the request from the caller's own guild, channel and voice state", () => {
    const request = playbackRequestFromInteraction(
      interaction({
        channelId: "text-9",
        guildId: "guild-9",
        userId: "user-9",
        voiceChannelId: "voice-9",
      }),
    );

    expect(request).toEqual({
      guildId: "guild-9",
      requesterId: "user-9",
      textChannelId: "text-9",
      voiceChannelId: "voice-9",
    });
  });

  it("refuses an interaction outside a cached guild", () => {
    expect(() => playbackRequestFromInteraction(interaction({ inGuild: false }))).toThrowError(
      expect.objectContaining({ code: "VOICE_CHANNEL_REQUIRED" }),
    );
  });

  it("refuses a caller who is not in a voice channel", () => {
    expect(() =>
      playbackRequestFromInteraction(interaction({ voiceChannelId: null })),
    ).toThrowError(expect.objectContaining({ code: "VOICE_CHANNEL_REQUIRED" }));
  });
});

describe("guildIdFromInteraction", () => {
  it("returns the guild id when present", () => {
    expect(guildIdFromInteraction(interaction({ guildId: "guild-7" }))).toBe("guild-7");
  });

  it("refuses an interaction without a guild", () => {
    expect(() => guildIdFromInteraction(interaction({ guildId: null }))).toThrowError(
      expect.objectContaining({ code: "UNAUTHORIZED_GUILD" }),
    );
  });
});
