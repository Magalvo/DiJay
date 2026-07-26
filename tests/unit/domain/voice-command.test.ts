import { describe, expect, it } from "vitest";

import {
  extractPlayQuery,
  matchSoundboardTrigger,
  parseVoiceCommand,
  parseWakeCommand,
  voiceGrammar,
} from "../../../src/domain/voice/voice-command.js";

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

describe("voiceGrammar", () => {
  it("includes the wake word so hands-free mode can recognize it", () => {
    // Without this, Vosk (constrained to the grammar) can never output the wake word and
    // wake-word mode would match nothing.
    expect(voiceGrammar("pt")).toContain("dj");
    expect(voiceGrammar("en")).toContain("dj");
  });

  it("includes the soundboard triggers so Vosk can recognize them", () => {
    // Same reason as the wake word: a word absent from the constrained grammar can never be
    // transcribed, so the soundboard trigger would never fire.
    for (const trigger of ["gelado", "leite"]) {
      expect(voiceGrammar("pt")).toContain(trigger);
      expect(voiceGrammar("en")).toContain(trigger);
    }
  });
});

describe("matchSoundboardTrigger", () => {
  it("returns the sound key when the trigger word is heard, with no wake word", () => {
    expect(matchSoundboardTrigger("gelado")).toBe("gelado");
    expect(matchSoundboardTrigger("quero um GELADO agora")).toBe("gelado");
    expect(matchSoundboardTrigger("leite")).toBe("leite");
    expect(matchSoundboardTrigger("passa o leite")).toBe("leite");
  });

  it("returns null when no trigger word is present", () => {
    expect(matchSoundboardTrigger("dj salta")).toBeNull();
    expect(matchSoundboardTrigger("")).toBeNull();
  });

  it("matches on whole tokens, not substrings", () => {
    expect(matchSoundboardTrigger("congelado")).toBeNull();
  });
});

describe("extractPlayQuery", () => {
  it("drops the wake word and play verb, keeping the song name", () => {
    expect(extractPlayQuery("dijay play adele", "en")).toBe("adele");
    expect(extractPlayQuery("dj toca coldplay yellow", "pt")).toBe("coldplay yellow");
    expect(extractPlayQuery("play daft punk one more time", "en")).toBe("daft punk one more time");
  });

  it("finds the play verb even after a garbled leading token", () => {
    expect(extractPlayQuery("digi play adele", "en")).toBe("adele");
  });

  it("uses the text after the wake word when no play verb is recognized", () => {
    expect(extractPlayQuery("dj adele", "en")).toBe("adele");
  });

  it("returns empty when only the wake word and verb were heard", () => {
    expect(extractPlayQuery("dj play unk", "en")).toBe("");
    expect(extractPlayQuery("dj", "en")).toBe("");
  });
});
