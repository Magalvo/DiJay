import type { Player, Poru, Track as PoruTrack } from "poru";

import type {
  PlaybackProbe,
  StreamProbeOutcome,
  StreamProbeRequest,
} from "../../application/diagnostics/playback-probe.js";
import type { Track } from "../../domain/music/track.js";

/** Played at zero volume: the probe must exercise the stream path without being audible. */
const PROBE_VOLUME = 0;

/**
 * Exercises the real Lavalink playback path: joins a voice channel, plays a track, and reports
 * whether audio actually flowed. Everything it creates is torn down before it returns.
 */
export class PoruPlaybackProbe implements PlaybackProbe {
  public constructor(private readonly poru: Poru) {}

  public isNodeConnected(): boolean {
    return [...this.poru.nodes.values()].some((node) => node.isConnected);
  }

  public isGuildBusy(guildId: string): boolean {
    return this.poru.get(guildId) !== null;
  }

  public async resolve(query: string): Promise<readonly Track[]> {
    const response = await this.poru.resolve({
      query,
      requester: "smoke-check",
      source: "ytsearch",
    });
    if (response.loadType === "empty" || response.loadType === "error") {
      return [];
    }
    return response.tracks.map((track) => ({
      author: track.info.author,
      durationMs: track.info.length,
      isStream: track.info.isStream,
      title: track.info.title,
      uri: track.info.uri ?? null,
    }));
  }

  public async probeStream(request: StreamProbeRequest): Promise<StreamProbeOutcome> {
    if (this.poru.get(request.guildId) !== null) {
      throw new Error("A player already exists for this guild");
    }

    const player = this.poru.createConnection({
      deaf: true,
      guildId: request.guildId,
      textChannel: request.voiceChannelId,
      voiceChannel: request.voiceChannelId,
    });

    const settled = this.waitForOutcome(request);
    try {
      await player.setVolume(PROBE_VOLUME);
      const response = await this.poru.resolve({
        query: request.query,
        requester: "smoke-check",
        source: "ytsearch",
      });
      if (response.loadType === "empty" || response.loadType === "error") {
        settled.cancel();
        return { error: null, positionMs: 0, started: false };
      }
      const [track] = response.tracks;
      if (track === undefined) {
        settled.cancel();
        return { error: null, positionMs: 0, started: false };
      }

      player.queue.add(track);
      await player.play();

      const start = await settled.promise;
      if (start.error !== null || !start.started) {
        return { error: start.error, positionMs: 0, started: start.started };
      }

      // Let it run, then read the position back: a track that "starts" and then streams
      // nothing is exactly the failure this check exists to catch.
      await delay(request.settleMs);
      return { error: null, positionMs: player.position, started: true };
    } finally {
      settled.cancel();
      await player.destroy().catch(() => undefined);
    }
  }

  /**
   * Resolves on whichever comes first: the track starting, the source failing it, or the
   * timeout. Listeners are always removed, so a probe never leaks handlers onto the shared
   * Poru instance.
   */
  private waitForOutcome(request: StreamProbeRequest): {
    cancel: () => void;
    promise: Promise<{ error: string | null; started: boolean }>;
  } {
    let cleanup = (): void => undefined;
    const promise = new Promise<{ error: string | null; started: boolean }>((resolve) => {
      const onStart = (player: Player): void => {
        if (player.guildId === request.guildId) {
          finish({ error: null, started: true });
        }
      };
      const onError = (player: Player, _track: PoruTrack, data: unknown): void => {
        if (player.guildId === request.guildId) {
          finish({ error: exceptionMessage(data), started: false });
        }
      };
      const timer = setTimeout(() => finish({ error: null, started: false }), request.timeoutMs);

      const finish = (outcome: { error: string | null; started: boolean }): void => {
        cleanup();
        resolve(outcome);
      };

      cleanup = (): void => {
        clearTimeout(timer);
        this.poru.off("trackStart", onStart);
        this.poru.off("trackError", onError);
        cleanup = (): void => undefined;
      };

      this.poru.on("trackStart", onStart);
      this.poru.on("trackError", onError);
    });

    return { cancel: () => cleanup(), promise };
  }
}

function exceptionMessage(data: unknown): string {
  if (typeof data === "object" && data !== null) {
    const record = data as { exception?: { message?: unknown }; thresholdMs?: unknown };
    if (typeof record.exception?.message === "string") {
      return record.exception.message;
    }
    if (typeof record.thresholdMs === "number") {
      return `A faixa bloqueou (sem áudio durante ${record.thresholdMs} ms).`;
    }
  }
  return "A fonte falhou sem detalhe.";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
