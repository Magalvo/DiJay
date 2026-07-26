import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import type { VoiceClipPlayer } from "../../../src/voice-listener/voice-clip-player.js";
import { VoiceListenerAudioActions } from "../../../src/voice-listener/voice-listener-audio-actions.js";

function clipPlayerMock(played = true) {
  return {
    play: vi.fn().mockResolvedValue(played),
  } as unknown as VoiceClipPlayer & { play: ReturnType<typeof vi.fn> };
}

describe("VoiceListenerAudioActions", () => {
  it("plays the configured listener join action", async () => {
    const clipPlayer = clipPlayerMock();
    const service = new VoiceListenerAudioActions({
      actions: [
        {
          cooldownSeconds: 86_400,
          file: "greeting.mp3",
          id: "mic_greeting",
          target: "voice_listener",
          trigger: "voice_listener_join",
        },
      ],
      audioActionsDir: "/app/audio-actions",
      clipPlayer,
    });

    await expect(
      service.handleListenerJoin({ channelId: "voice-1", connection: {}, guildId: "guild-1" }),
    ).resolves.toBe(true);
    expect(clipPlayer.play).toHaveBeenCalledWith(
      {},
      "guild-1:voice-1:mic_greeting",
      join("/app/audio-actions", "greeting.mp3"),
      86_400,
    );
  });

  it("uses the legacy greeting only when no manifest join action exists", async () => {
    const clipPlayer = clipPlayerMock();
    const service = new VoiceListenerAudioActions({
      actions: [],
      audioActionsDir: "/app/audio-actions",
      clipPlayer,
      legacyGreeting: {
        cooldownSeconds: 60,
        enabled: true,
        file: "/app/audio-actions/legacy.mp3",
      },
    });

    await expect(
      service.handleListenerJoin({ channelId: "voice-1", connection: {}, guildId: "guild-1" }),
    ).resolves.toBe(true);
    expect(clipPlayer.play).toHaveBeenCalledWith(
      {},
      "guild-1:voice-1:legacy_voice_greeting",
      "/app/audio-actions/legacy.mp3",
      60,
    );
  });

  it("plays a spoken phrase action before command handling", async () => {
    const clipPlayer = clipPlayerMock();
    const service = new VoiceListenerAudioActions({
      actions: [
        {
          cooldownSeconds: 10,
          file: "gelado.mp3",
          id: "gelado",
          phrases: { pt: ["gelado"] },
          target: "voice_listener",
          trigger: "spoken_phrase",
        },
      ],
      audioActionsDir: "/app/audio-actions",
      clipPlayer,
    });

    await expect(
      service.handleSpokenPhrase({
        channelId: "voice-1",
        connection: {},
        guildId: "guild-1",
        language: "pt",
        transcript: "quero um GELADO agora",
        userId: "user-1",
      }),
    ).resolves.toBe(true);
    expect(clipPlayer.play).toHaveBeenCalledWith(
      {},
      "guild-1:voice-1:user-1:gelado",
      join("/app/audio-actions", "gelado.mp3"),
      10,
    );
  });

  it("returns false when no spoken phrase matches", async () => {
    const clipPlayer = clipPlayerMock();
    const service = new VoiceListenerAudioActions({
      actions: [
        {
          cooldownSeconds: 10,
          file: "gelado.mp3",
          id: "gelado",
          phrases: { pt: ["gelado"] },
          target: "voice_listener",
          trigger: "spoken_phrase",
        },
      ],
      audioActionsDir: "/app/audio-actions",
      clipPlayer,
    });

    await expect(
      service.handleSpokenPhrase({
        channelId: "voice-1",
        connection: {},
        guildId: "guild-1",
        language: "pt",
        transcript: "congelado",
        userId: "user-1",
      }),
    ).resolves.toBe(false);
    expect(clipPlayer.play).not.toHaveBeenCalled();
  });

  it("exposes spoken phrases for the selected recognition language", () => {
    const service = new VoiceListenerAudioActions({
      actions: [
        {
          cooldownSeconds: 10,
          file: "bora.mp3",
          id: "bora",
          phrases: { en: ["lets go"], pt: ["bora"] },
          target: "voice_listener",
          trigger: "spoken_phrase",
        },
      ],
      audioActionsDir: "/app/audio-actions",
      clipPlayer: clipPlayerMock(),
    });

    expect(service.extraGrammar("pt")).toEqual(["bora"]);
    expect(service.extraGrammar("en")).toEqual(["lets go"]);
  });
});
