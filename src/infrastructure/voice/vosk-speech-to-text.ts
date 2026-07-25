import { Model, Recognizer, setLogLevel } from "vosk-koffi";

import type { SpeechToText } from "../../application/voice/speech-to-text.js";

/**
 * Vosk-backed offline speech-to-text. Uses the koffi binding so it runs on current Node
 * versions. Requires the native `libvosk` library (downloaded on install) and a language
 * model directory pointed to by `modelPath`.
 */
export class VoskSpeechToText implements SpeechToText {
  private readonly model: Model;

  public constructor(
    modelPath: string,
    private readonly grammar?: readonly string[],
  ) {
    setLogLevel(-1);
    this.model = new Model(modelPath);
  }

  public transcribe(pcm: Buffer, sampleRate: number): Promise<string> {
    const recognizer = this.createRecognizer(sampleRate);
    try {
      recognizer.acceptWaveform(pcm);
      // Without setMaxAlternatives Vosk returns `{ text }`, not `{ alternatives }`, so read
      // both shapes defensively instead of destructuring a possibly-undefined array.
      const result = recognizer.finalResult() as unknown as {
        alternatives?: { text?: string }[];
        text?: string;
      };
      const text = result.text ?? result.alternatives?.[0]?.text ?? "";
      // Vosk emits "[unk]" for rejected speech under a grammar; treat it as nothing heard.
      return Promise.resolve(text === "[unk]" ? "" : text);
    } finally {
      recognizer.free();
    }
  }

  private createRecognizer(sampleRate: number): Recognizer<{ grammar?: string[] }> {
    if (this.grammar !== undefined && this.grammar.length > 0) {
      try {
        return new Recognizer({ grammar: [...this.grammar], model: this.model, sampleRate });
      } catch {
        // The model does not support a dynamic grammar; fall back to open recognition.
      }
    }
    return new Recognizer({ model: this.model, sampleRate });
  }

  public close(): void {
    this.model.free();
  }
}
