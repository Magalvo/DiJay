import type { ChatInputCommandInteraction } from "discord.js";

import type { MusicService } from "../../application/music/music-service.js";
import type { VoiceLanguage } from "../../domain/voice/voice-command.js";
import type { AppLogger } from "./command.js";

/**
 * Runtime surface of the optional voice-recognition feature. The concrete implementation
 * lives in `infrastructure/voice` and is loaded dynamically only when voice is enabled, so
 * the lean production build never depends on the native audio/STT packages.
 */
export interface VoiceFeature {
  handleListen(interaction: ChatInputCommandInteraction): Promise<void>;
  dispose(): void;
}

export interface VoiceFeatureDeps {
  readonly language: VoiceLanguage;
  readonly logger: AppLogger;
  readonly modelPath: string;
  readonly music: MusicService;
}

export type CreateVoiceFeature = (deps: VoiceFeatureDeps) => VoiceFeature;
