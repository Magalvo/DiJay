export interface VoiceClipAudioPlayer<Resource = unknown> {
  play(resource: Resource): void;
}

export interface VoiceClipPlayerDeps<Resource = unknown> {
  readonly createAudioResource: (file: string) => Resource;
  readonly createPlayer: () => VoiceClipAudioPlayer<Resource>;
  readonly now?: () => number;
  readonly subscribe: (connection: unknown, player: VoiceClipAudioPlayer<Resource>) => void;
}

export class VoiceClipPlayer<Resource = unknown> {
  private readonly cooldownUntil = new Map<string, number>();
  private readonly now: () => number;

  public constructor(private readonly deps: VoiceClipPlayerDeps<Resource>) {
    this.now = deps.now ?? Date.now;
  }

  public async play(
    connection: unknown,
    cooldownKey: string,
    file: string,
    cooldownSeconds: number,
  ): Promise<boolean> {
    if (file.length === 0 || this.isCoolingDown(cooldownKey)) {
      return false;
    }

    const player = this.deps.createPlayer();
    this.deps.subscribe(connection, player);
    player.play(this.deps.createAudioResource(file));
    this.cooldownUntil.set(cooldownKey, this.now() + cooldownSeconds * 1000);
    return true;
  }

  private isCoolingDown(cooldownKey: string): boolean {
    return (this.cooldownUntil.get(cooldownKey) ?? 0) > this.now();
  }
}
