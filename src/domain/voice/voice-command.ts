export type VoiceIntent =
  | { readonly kind: "pause" }
  | { readonly kind: "play"; readonly query: string }
  | { readonly kind: "resume" }
  | { readonly kind: "shuffle" }
  | { readonly kind: "skip" }
  | { readonly kind: "stop" }
  | { readonly kind: "unknown" }
  | { readonly kind: "volume"; readonly level: number };

const WAKE_WORDS = ["dijay", "di jay", "dj"];

const PLAY_VERBS = new Set(["toca", "tocar", "poe", "por", "reproduz", "reproduzir", "play"]);

// Ordered so that skip beats stop when a phrase such as "salta para a proxima" mentions
// both keywords.
const CONTROL_KEYWORDS: readonly (readonly [VoiceIntent, readonly string[]])[] = [
  [{ kind: "pause" }, ["pausa", "pausar", "pause"]],
  [{ kind: "resume" }, ["retoma", "retomar", "continua", "continuar", "resume"]],
  [{ kind: "skip" }, ["salta", "saltar", "proxima", "proximo", "passa", "avanca", "skip", "next"]],
  [{ kind: "stop" }, ["para", "parar", "stop", "sai", "desliga"]],
  [{ kind: "shuffle" }, ["baralha", "baralhar", "aleatorio", "shuffle"]],
];

/**
 * Portuguese vocabulary handed to the recognizer as a constrained grammar. Limiting Vosk to
 * these words makes short spoken commands far more reliable than open recognition. English
 * synonyms and the wake word are omitted because they are unlikely to exist in a PT model's
 * lexicon (push-to-talk does not need a wake word). `[unk]` lets Vosk reject anything else.
 */
export const VOICE_GRAMMAR: readonly string[] = [
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
];

const NUMBER_WORDS: Readonly<Record<string, number>> = {
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
};

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

function stripWakeWord(normalized: string): string {
  for (const wake of WAKE_WORDS) {
    if (normalized === wake) {
      return "";
    }
    if (normalized.startsWith(`${wake} `)) {
      return normalized.slice(wake.length + 1).trim();
    }
  }
  return normalized;
}

function parseLevel(text: string): number | null {
  const digits = /\d{1,3}/.exec(text);
  if (digits !== null) {
    const value = Number(digits[0]);
    return value >= 0 && value <= 150 ? value : null;
  }
  for (const word of text.split(" ")) {
    if (word in NUMBER_WORDS) {
      return NUMBER_WORDS[word]!;
    }
  }
  return null;
}

/**
 * Maps a raw speech transcript to a bounded voice intent. The wake word is optional and
 * stripped when present; unrecognized phrases resolve to `unknown` so callers can ignore
 * them safely.
 */
export function parseVoiceCommand(transcript: string): VoiceIntent {
  const text = stripWakeWord(normalizeTranscript(transcript));
  if (text.length === 0) {
    return { kind: "unknown" };
  }

  const words = text.split(" ");
  const [head, ...rest] = words;

  // Checked before the play verb so "poe o volume a cinquenta" is a volume change, not a
  // request to play a track named "o volume a cinquenta".
  if (words.includes("volume")) {
    const level = parseLevel(text.replace("volume", " "));
    if (level !== null) {
      return { kind: "volume", level };
    }
  }

  if (head !== undefined && PLAY_VERBS.has(head) && rest.length > 0) {
    return { kind: "play", query: rest.join(" ") };
  }

  for (const [intent, keywords] of CONTROL_KEYWORDS) {
    if (words.some((word) => keywords.includes(word))) {
      return intent;
    }
  }

  return { kind: "unknown" };
}
