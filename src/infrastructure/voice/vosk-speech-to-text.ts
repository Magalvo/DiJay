import { Model, Recognizer, setLogLevel } from "vosk-koffi";

import type { SpeechToText } from "../../application/voice/speech-to-text.js";

/**
 * Vosk-backed offline speech-to-text. Uses the koffi binding so it runs on current Node
 * versions. Requires the native `libvosk` library (downloaded on install) and a language
 * model directory pointed to by `modelPath`.
 */
export class VoskSpeechToText implements SpeechToText {
  private readonly model: Model;

  public constructor(modelPath: string) {
    setLogLevel(-1);
    this.model = new Model(modelPath);
  }

  public transcribe(pcm: Buffer, sampleRate: number): Promise<string> {
    const recognizer = new Recognizer({ model: this.model, sampleRate });
    try {
      recognizer.acceptWaveform(pcm);
      // Without setMaxAlternatives Vosk returns `{ text }`, not `{ alternatives }`, so read
      // both shapes defensively instead of destructuring a possibly-undefined array.
      const result = recognizer.finalResult() as unknown as {
        alternatives?: { text?: string }[];
        text?: string;
      };
      return Promise.resolve(result.text ?? result.alternatives?.[0]?.text ?? "");
    } finally {
      recognizer.free();
    }
  }

  public close(): void {
    this.model.free();
  }
}
