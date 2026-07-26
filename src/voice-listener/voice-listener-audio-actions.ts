import { join } from "node:path";

import type {
  AudioActionDefinition,
  VoiceListenerAudioActionDefinition,
  VoiceListenerSpokenPhraseAudioActionDefinition,
} from "../application/audio-actions/audio-action-manifest.js";
import { normalizeTranscript, type VoiceLanguage } from "../domain/voice/voice-command.js";
import type { VoiceClipPlayer } from "./voice-clip-player.js";

export interface LegacyVoiceGreetingConfig {
  readonly cooldownSeconds: number;
  readonly enabled: boolean;
  readonly file: string;
}

export interface VoiceListenerAudioActionsDeps {
  readonly actions: readonly AudioActionDefinition[];
  readonly audioActionsDir: string;
  readonly clipPlayer: Pick<VoiceClipPlayer, "play">;
  readonly legacyGreeting?: LegacyVoiceGreetingConfig;
}

export interface ListenerJoinEvent {
  readonly channelId: string;
  readonly connection: unknown;
  readonly guildId: string;
}

export interface ListenerMemberJoinEvent extends ListenerJoinEvent {
  readonly userId: string;
}

export interface SpokenPhraseEvent extends ListenerMemberJoinEvent {
  readonly language: VoiceLanguage;
  readonly transcript: string;
}

export class VoiceListenerAudioActions {
  private readonly actions: readonly VoiceListenerAudioActionDefinition[];

  public constructor(private readonly deps: VoiceListenerAudioActionsDeps) {
    this.actions = deps.actions.filter(isVoiceListenerAction);
  }

  public extraGrammar(language: VoiceLanguage): readonly string[] {
    return this.spokenPhraseActions().flatMap((action) => action.phrases[language] ?? []);
  }

  public async handleListenerJoin(event: ListenerJoinEvent): Promise<boolean> {
    const action = this.actions.find((candidate) => candidate.trigger === "voice_listener_join");
    if (action !== undefined) {
      return this.deps.clipPlayer.play(
        event.connection,
        `${event.guildId}:${event.channelId}:${action.id}`,
        this.clipPath(action.file),
        action.cooldownSeconds,
      );
    }

    const legacy = this.deps.legacyGreeting;
    if (legacy === undefined || !legacy.enabled || legacy.file.length === 0) {
      return false;
    }
    return this.deps.clipPlayer.play(
      event.connection,
      `${event.guildId}:${event.channelId}:legacy_voice_greeting`,
      legacy.file,
      legacy.cooldownSeconds,
    );
  }

  public async handleListenerMemberJoin(event: ListenerMemberJoinEvent): Promise<boolean> {
    const action = this.actions.find(
      (candidate) => candidate.trigger === "voice_listener_member_join",
    );
    if (action === undefined) {
      return false;
    }

    return this.deps.clipPlayer.play(
      event.connection,
      `${event.guildId}:${event.channelId}:${event.userId}:${action.id}`,
      this.clipPath(action.file),
      action.cooldownSeconds,
    );
  }

  public async handleSpokenPhrase(event: SpokenPhraseEvent): Promise<boolean> {
    if (event.transcript.trim().length === 0) {
      return false;
    }

    const paddedTranscript = ` ${normalizeTranscript(event.transcript)} `;
    for (const action of this.spokenPhraseActions()) {
      const phrases = action.phrases[event.language] ?? [];
      if (!phrases.some((phrase) => phraseMatches(paddedTranscript, phrase))) {
        continue;
      }
      return this.deps.clipPlayer.play(
        event.connection,
        `${event.guildId}:${event.channelId}:${event.userId}:${action.id}`,
        this.clipPath(action.file),
        action.cooldownSeconds,
      );
    }
    return false;
  }

  private spokenPhraseActions(): readonly VoiceListenerSpokenPhraseAudioActionDefinition[] {
    return this.actions.filter(
      (action): action is VoiceListenerSpokenPhraseAudioActionDefinition =>
        action.trigger === "spoken_phrase",
    );
  }

  private clipPath(file: string): string {
    return join(this.deps.audioActionsDir, file);
  }
}

function isVoiceListenerAction(
  action: AudioActionDefinition,
): action is VoiceListenerAudioActionDefinition {
  return action.target === "voice_listener";
}

function phraseMatches(paddedTranscript: string, phrase: string): boolean {
  const normalizedPhrase = normalizeTranscript(phrase);
  return normalizedPhrase.length > 0 && paddedTranscript.includes(` ${normalizedPhrase} `);
}
