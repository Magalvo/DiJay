/**
 * Port for an offline speech-to-text engine. Adapters receive mono 16-bit PCM audio and
 * return the recognized transcript (empty when nothing was understood).
 */
export interface SpeechToText {
  transcribe(pcm: Buffer, sampleRate: number): Promise<string>;
}
