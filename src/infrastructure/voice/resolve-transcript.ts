import {
  extractPlayQuery,
  parseVoiceCommand,
  parseWakeCommand,
  type VoiceLanguage,
} from "../../domain/voice/voice-command.js";
import type { CaptureResult } from "./discord-voice-listener.js";

const PLAY_VERB: Readonly<Record<VoiceLanguage, string>> = { en: "play", pt: "toca" };

/**
 * Turns a captured utterance into the transcript to act on, or null when nothing actionable
 * was said. Command detection uses the constrained grammar transcript; for a `play` command
 * the song name is re-transcribed with open vocabulary (so it is not mangled into "[unk]") and
 * rebuilt as "<play verb> <query>" so the downstream parser recognizes it deterministically.
 *
 * @param requireWakeWord true for hands-free mode (the wake word must be present).
 */
export async function resolveTranscript(
  result: CaptureResult,
  language: VoiceLanguage,
  requireWakeWord: boolean,
): Promise<string | null> {
  const intent = requireWakeWord
    ? parseWakeCommand(result.transcript, language)
    : parseVoiceCommand(result.transcript, language);

  if (intent.kind === "unknown") {
    return null;
  }
  if (intent.kind === "play") {
    const query = extractPlayQuery(await result.transcribeOpen(), language);
    return query.length === 0 ? null : `${PLAY_VERB[language]} ${query}`;
  }
  return result.transcript;
}
