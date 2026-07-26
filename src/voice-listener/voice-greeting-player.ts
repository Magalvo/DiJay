export interface VoiceGreetingAudioPlayer<Resource = unknown> {
  play(resource: Resource): void;
}

export interface VoiceGreetingPlayerDeps<Resource = unknown> {
  readonly cooldownSeconds: number;
  readonly createAudioResource: (file: string) => Resource;
  readonly createPlayer: () => VoiceGreetingAudioPlayer<Resource>;
  readonly file: string;
  readonly now?: () => number;
  readonly subscribe: (connection: unknown, player: VoiceGreetingAudioPlayer<Resource>) => void;
}

export class VoiceGreetingPlayer<Resource = unknown> {
  private readonly cooldownUntil = new Map<string, number>();
  private readonly now: () => number;

  public constructor(private readonly deps: VoiceGreetingPlayerDeps<Resource>) {
    this.now = deps.now ?? Date.now;
  }

  public async play(connection: unknown, channelId: string): Promise<boolean> {
    if (this.deps.file.length === 0 || this.isCoolingDown(channelId)) {
      return false;
    }

    const player = this.deps.createPlayer();
    this.deps.subscribe(connection, player);
    player.play(this.deps.createAudioResource(this.deps.file));
    this.cooldownUntil.set(channelId, this.now() + this.deps.cooldownSeconds * 1000);
    return true;
  }

  private isCoolingDown(channelId: string): boolean {
    return (this.cooldownUntil.get(channelId) ?? 0) > this.now();
  }
}
