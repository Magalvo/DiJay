/**
 * Port for an offline speech-to-text engine. Adapters receive mono 16-bit PCM audio and
 * return the recognized transcript (empty when nothing was understood).
 */
export interface SpeechToText {
  /** Constrained transcription (command grammar), for reliable command detection. */
  transcribe(pcm: Buffer, sampleRate: number): Promise<string>;
  /** Open-vocabulary transcription, for free text such as a spoken song name. */
  transcribeOpen(pcm: Buffer, sampleRate: number): Promise<string>;
}
