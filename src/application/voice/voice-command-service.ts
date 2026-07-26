import {
  parseVoiceCommand,
  type VoiceIntent,
  type VoiceLanguage,
} from "../../domain/voice/voice-command.js";
import type { PlaybackRequest } from "../music/music-gateway.js";
import type { MusicService } from "../music/music-service.js";

export interface VoiceCommandOutcome {
  readonly handled: boolean;
  readonly intent: VoiceIntent["kind"];
  readonly message: string;
}

/**
 * Turns a recognized transcript into a music action, reusing the same guards and errors as
 * the slash commands. Unknown phrases are ignored so the bot never acts on speech it did
 * not understand.
 */
export class VoiceCommandService {
  public constructor(
    private readonly music: MusicService,
    private readonly language: VoiceLanguage = "pt",
  ) {}

  public async handle(
    transcript: string,
    request: PlaybackRequest,
    language: VoiceLanguage = this.language,
  ): Promise<VoiceCommandOutcome> {
    const intent = parseVoiceCommand(transcript, language);
    switch (intent.kind) {
      case "pause":
        await this.music.pause(request);
        return outcome("pause", "⏸️ Reprodução pausada.");
      case "resume":
        await this.music.resume(request);
        return outcome("resume", "▶️ Reprodução retomada.");
      case "skip":
        await this.music.skip(request);
        return outcome("skip", "⏭️ Música saltada.");
      case "stop":
        await this.music.stop(request);
        return outcome("stop", "⏹️ Reprodução parada.");
      case "shuffle": {
        const count = await this.music.shuffle(request);
        return outcome("shuffle", `🔀 ${count} músicas baralhadas.`);
      }
      case "volume":
        await this.music.setVolume({ ...request, volume: intent.level });
        return outcome("volume", `🔊 Volume em ${intent.level}%.`);
      case "play": {
        const result = await this.music.play({
          ...request,
          position: "queue",
          query: intent.query,
        });
        return outcome("play", `🎵 Adicionada à fila: ${result.added[0]?.title ?? intent.query}`);
      }
      case "unknown":
        return { handled: false, intent: "unknown", message: "Não percebi o comando." };
    }
  }
}

function outcome(intent: VoiceIntent["kind"], message: string): VoiceCommandOutcome {
  return { handled: true, intent, message };
}
