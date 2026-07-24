import { describe, expect, it } from "vitest";

import { parseVoiceCommand } from "../../../src/domain/voice/voice-command.js";

describe("parseVoiceCommand", () => {
  it("maps Portuguese control phrases to intents", () => {
    expect(parseVoiceCommand("pausa")).toEqual({ kind: "pause" });
    expect(parseVoiceCommand("Continua a música")).toEqual({ kind: "resume" });
    expect(parseVoiceCommand("baralha as músicas")).toEqual({ kind: "shuffle" });
    expect(parseVoiceCommand("para")).toEqual({ kind: "stop" });
  });

  it("strips an optional wake word", () => {
    expect(parseVoiceCommand("DiJay salta")).toEqual({ kind: "skip" });
    expect(parseVoiceCommand("dijay")).toEqual({ kind: "unknown" });
  });

  it("prefers skip over stop when a phrase mentions both", () => {
    expect(parseVoiceCommand("salta para a próxima")).toEqual({ kind: "skip" });
  });

  it("extracts a play query after a play verb", () => {
    expect(parseVoiceCommand("toca daft punk one more time")).toEqual({
      kind: "play",
      query: "daft punk one more time",
    });
    expect(parseVoiceCommand("toca")).toEqual({ kind: "unknown" });
  });

  it("parses volume from digits and number words", () => {
    expect(parseVoiceCommand("volume 40")).toEqual({ kind: "volume", level: 40 });
    expect(parseVoiceCommand("põe o volume a cinquenta")).toEqual({ kind: "volume", level: 50 });
    expect(parseVoiceCommand("volume")).toEqual({ kind: "unknown" });
  });

  it("returns unknown for unrecognized speech", () => {
    expect(parseVoiceCommand("olá tudo bem")).toEqual({ kind: "unknown" });
    expect(parseVoiceCommand("")).toEqual({ kind: "unknown" });
  });
});
