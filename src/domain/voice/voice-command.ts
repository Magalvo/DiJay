export type VoiceIntent =
  | { readonly kind: "pause" }
  | { readonly kind: "play"; readonly query: string }
  | { readonly kind: "resume" }
  | { readonly kind: "shuffle" }
  | { readonly kind: "skip" }
  | { readonly kind: "stop" }
  | { readonly kind: "unknown" }
  | { readonly kind: "volume"; readonly level: number };

export type VoiceLanguage = "pt" | "en";

interface VoiceVocabulary {
  /** Ordered so an earlier intent wins when a phrase mentions several keywords. */
  readonly controlKeywords: readonly (readonly [VoiceIntent, readonly string[]])[];
  /** Words handed to Vosk as a constrained grammar; `[unk]` lets it reject anything else. */
  readonly grammar: readonly string[];
  readonly numberWords: Readonly<Record<string, number>>;
  readonly playVerbs: ReadonlySet<string>;
  readonly wakeWords: readonly string[];
}

const PT: VoiceVocabulary = {
  controlKeywords: [
    [{ kind: "pause" }, ["pausa", "pausar"]],
    [{ kind: "resume" }, ["retoma", "retomar", "continua", "continuar"]],
    [{ kind: "skip" }, ["salta", "saltar", "proxima", "proximo", "passa", "avanca"]],
    [{ kind: "stop" }, ["para", "parar", "sai", "desliga"]],
    [{ kind: "shuffle" }, ["baralha", "baralhar", "aleatorio"]],
  ],
  grammar: [
    "pausa",
    "pausar",
    "retoma",
    "retomar",
    "continua",
    "continuar",
    "salta",
    "saltar",
    "proxima",
    "proximo",
    "passa",
    "avanca",
    "para",
    "parar",
    "sai",
    "desliga",
    "baralha",
    "baralhar",
    "aleatorio",
    "volume",
    "toca",
    "tocar",
    "poe",
    "reproduz",
    "reproduzir",
    "zero",
    "dez",
    "vinte",
    "trinta",
    "quarenta",
    "cinquenta",
    "sessenta",
    "setenta",
    "oitenta",
    "noventa",
    "cem",
    "[unk]",
  ],
  numberWords: {
    zero: 0,
    dez: 10,
    vinte: 20,
    trinta: 30,
    quarenta: 40,
    cinquenta: 50,
    sessenta: 60,
    setenta: 70,
    oitenta: 80,
    noventa: 90,
    cem: 100,
  },
  playVerbs: new Set(["toca", "tocar", "poe", "por", "reproduz", "reproduzir"]),
  wakeWords: ["dijay", "di jay", "dj"],
};

const EN: VoiceVocabulary = {
  controlKeywords: [
    [{ kind: "pause" }, ["pause"]],
    [{ kind: "resume" }, ["resume", "continue", "unpause"]],
    [{ kind: "skip" }, ["skip", "next", "forward"]],
    [{ kind: "stop" }, ["stop", "leave", "quit"]],
    [{ kind: "shuffle" }, ["shuffle", "random"]],
  ],
  grammar: [
    "pause",
    "resume",
    "continue",
    "unpause",
    "skip",
    "next",
    "forward",
    "stop",
    "leave",
    "quit",
    "shuffle",
    "random",
    "volume",
    "play",
    "put",
    "queue",
    "start",
    "zero",
    "ten",
    "twenty",
    "thirty",
    "forty",
    "fifty",
    "sixty",
    "seventy",
    "eighty",
    "ninety",
    "hundred",
    "[unk]",
  ],
  numberWords: {
    zero: 0,
    ten: 10,
    twenty: 20,
    thirty: 30,
    forty: 40,
    fifty: 50,
    sixty: 60,
    seventy: 70,
    eighty: 80,
    ninety: 90,
    hundred: 100,
  },
  playVerbs: new Set(["play", "put", "queue", "start"]),
  wakeWords: ["dijay", "di jay", "dj"],
};

const VOCABULARIES: Readonly<Record<VoiceLanguage, VoiceVocabulary>> = { en: EN, pt: PT };

/** Words handed to the recognizer as a constrained grammar for the given language. */
export function voiceGrammar(language: VoiceLanguage): readonly string[] {
  return VOCABULARIES[language].grammar;
}

/** Lowercases, strips accents and punctuation, and collapses whitespace. */
export function normalizeTranscript(transcript: string): string {
  return transcript
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripWakeWord(normalized: string, wakeWords: readonly string[]): string {
  for (const wake of wakeWords) {
    if (normalized === wake) {
      return "";
    }
    if (normalized.startsWith(`${wake} `)) {
      return normalized.slice(wake.length + 1).trim();
    }
  }
  return normalized;
}

function parseLevel(text: string, numberWords: Readonly<Record<string, number>>): number | null {
  const digits = /\d{1,3}/.exec(text);
  if (digits !== null) {
    const value = Number(digits[0]);
    return value >= 0 && value <= 150 ? value : null;
  }
  for (const word of text.split(" ")) {
    if (word in numberWords) {
      return numberWords[word]!;
    }
  }
  return null;
}

/**
 * Maps a raw speech transcript to a bounded voice intent for the given language. The wake word
 * is optional and stripped when present; unrecognized phrases resolve to `unknown` so callers
 * can ignore them safely.
 */
export function parseVoiceCommand(transcript: string, language: VoiceLanguage = "pt"): VoiceIntent {
  const vocabulary = VOCABULARIES[language];
  const text = stripWakeWord(normalizeTranscript(transcript), vocabulary.wakeWords);
  if (text.length === 0) {
    return { kind: "unknown" };
  }

  const words = text.split(" ");
  const [head, ...rest] = words;

  // Checked before the play verb so "poe o volume a cinquenta" is a volume change, not a
  // request to play a track named "o volume a cinquenta".
  if (words.includes("volume")) {
    const level = parseLevel(text.replace("volume", " "), vocabulary.numberWords);
    if (level !== null) {
      return { kind: "volume", level };
    }
  }

  if (head !== undefined && vocabulary.playVerbs.has(head) && rest.length > 0) {
    return { kind: "play", query: rest.join(" ") };
  }

  for (const [intent, keywords] of vocabulary.controlKeywords) {
    if (words.some((word) => keywords.includes(word))) {
      return intent;
    }
  }

  return { kind: "unknown" };
}
