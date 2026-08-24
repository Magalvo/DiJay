import type {
  PlaybackCheckResult,
  PlaybackCheckStage,
  PlaybackCheckVerdict,
} from "../../domain/diagnostics/playback-check.js";
import type { PlaybackProbe } from "./playback-probe.js";

export interface PlaybackSmokeCheckConfig {
  readonly guildId: string;
  /** What to search for. A stable, always-available track keeps false alarms down. */
  readonly query: string;
  readonly settleMs: number;
  readonly timeoutMs: number;
  /** Voice channel used for the probe; null disables the stream stage. */
  readonly voiceChannelId: string | null;
}

/**
 * Verifies that music can actually be played, end to end, and reports which layer broke.
 *
 * The check exists because the observed YouTube failures do not surface as errors anywhere:
 * search keeps working, `/play` answers "added to the queue", and the bot then sits in the
 * channel in silence. So reaching the stream stage — and confirming the position advanced —
 * is the only result that means anything. Every weaker outcome is reported as `skipped`
 * rather than `passed`.
 */
export class PlaybackSmokeCheck {
  public constructor(
    private readonly probe: PlaybackProbe,
    private readonly config: PlaybackSmokeCheckConfig,
    private readonly now: () => number = () => Date.now(),
  ) {}

  public async run(): Promise<PlaybackCheckResult> {
    const startedAt = this.now();
    const finish = (
      verdict: PlaybackCheckVerdict,
      reachedStage: PlaybackCheckStage,
      detail: string,
      trackTitle: string | null = null,
    ): PlaybackCheckResult => ({
      detail,
      durationMs: this.now() - startedAt,
      reachedStage,
      trackTitle,
      verdict,
    });

    if (!this.probe.isNodeConnected()) {
      return finish("failed", "node", "O nó Lavalink não está ligado.");
    }

    let title: string | null;
    try {
      const [track] = await this.probe.resolve(this.config.query);
      if (track === undefined) {
        return finish("failed", "resolve", `A pesquisa não devolveu faixas: ${this.config.query}`);
      }
      title = track.title;
    } catch (error) {
      return finish("failed", "resolve", `A pesquisa falhou: ${describe(error)}`);
    }

    const { voiceChannelId } = this.config;
    if (voiceChannelId === null) {
      return finish(
        "skipped",
        "resolve",
        "A pesquisa resolveu, mas não há canal de voz configurado para testar a reprodução. " +
          "Isto não prova que o áudio toca.",
        title,
      );
    }
    if (this.probe.isGuildBusy(this.config.guildId)) {
      return finish(
        "skipped",
        "resolve",
        "A pesquisa resolveu; reprodução não testada porque o bot está a ser usado.",
        title,
      );
    }

    let outcome;
    try {
      outcome = await this.probe.probeStream({
        guildId: this.config.guildId,
        query: this.config.query,
        settleMs: this.config.settleMs,
        timeoutMs: this.config.timeoutMs,
        voiceChannelId,
      });
    } catch (error) {
      return finish("failed", "stream", `A reprodução falhou: ${describe(error)}`, title);
    }

    if (outcome.error !== null) {
      return finish("failed", "stream", `A fonte recusou a faixa: ${outcome.error}`, title);
    }
    if (!outcome.started) {
      return finish(
        "failed",
        "stream",
        "A faixa nunca começou dentro do tempo limite (sem erro da fonte).",
        title,
      );
    }
    if (outcome.positionMs <= 0) {
      // The exact symptom of the YouTube breakages: playback "starts" and then no audio flows.
      return finish(
        "failed",
        "stream",
        "A faixa começou mas a posição não avançou: o bot ficaria em silêncio.",
        title,
      );
    }

    return finish("passed", "stream", `Reprodução confirmada a ${outcome.positionMs} ms.`, title);
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
