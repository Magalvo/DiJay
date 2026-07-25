import { describe, expect, it } from "vitest";

import { parseVoiceCommand, parseWakeCommand } from "../../../src/domain/voice/voice-command.js";

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

  it("maps English control phrases when the language is en", () => {
    expect(parseVoiceCommand("pause", "en")).toEqual({ kind: "pause" });
    expect(parseVoiceCommand("DiJay next", "en")).toEqual({ kind: "skip" });
    expect(parseVoiceCommand("shuffle the queue", "en")).toEqual({ kind: "shuffle" });
    expect(parseVoiceCommand("stop", "en")).toEqual({ kind: "stop" });
  });

  it("extracts an English play query and volume", () => {
    expect(parseVoiceCommand("play daft punk one more time", "en")).toEqual({
      kind: "play",
      query: "daft punk one more time",
    });
    expect(parseVoiceCommand("volume forty", "en")).toEqual({ kind: "volume", level: 40 });
    expect(parseVoiceCommand("set the volume to eighty", "en")).toEqual({
      kind: "volume",
      level: 80,
    });
  });

  it("does not understand the other language's words", () => {
    expect(parseVoiceCommand("pausa", "en")).toEqual({ kind: "unknown" });
    expect(parseVoiceCommand("pause", "pt")).toEqual({ kind: "unknown" });
  });
});

describe("parseWakeCommand", () => {
  it("acts only when the utterance begins with a wake word", () => {
    expect(parseWakeCommand("dj salta")).toEqual({ kind: "skip" });
    expect(parseWakeCommand("dj toca daft punk")).toEqual({ kind: "play", query: "daft punk" });
    expect(parseWakeCommand("dj skip", "en")).toEqual({ kind: "skip" });
  });

  it("ignores speech without the wake word", () => {
    expect(parseWakeCommand("salta")).toEqual({ kind: "unknown" });
    expect(parseWakeCommand("skip", "en")).toEqual({ kind: "unknown" });
  });

  it("ignores the bare wake word with no command", () => {
    expect(parseWakeCommand("dj")).toEqual({ kind: "unknown" });
    expect(parseWakeCommand("DiJay")).toEqual({ kind: "unknown" });
  });
});
