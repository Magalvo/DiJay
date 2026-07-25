import type { Readable } from "node:stream";

import {
  type DiscordGatewayAdapterCreator,
  EndBehaviorType,
  VoiceConnectionStatus,
  entersState,
  joinVoiceChannel,
} from "@discordjs/voice";
import prism from "prism-media";

import type { SpeechToText } from "../../application/voice/speech-to-text.js";

const DISCORD_SAMPLE_RATE = 48_000;
const TARGET_SAMPLE_RATE = 16_000;
const DECIMATION = DISCORD_SAMPLE_RATE / TARGET_SAMPLE_RATE;
const SILENCE_MS = 1_000;
const READY_TIMEOUT_MS = 10_000;

function noop(): void {
  // Intentionally ignore stream teardown errors.
}

export interface VoiceCaptureRequest {
  readonly adapterCreator: DiscordGatewayAdapterCreator;
  readonly channelId: string;
  readonly guildId: string;
  readonly maxDurationMs: number;
  readonly userId: string;
}

/**
 * Captures a single spoken utterance from one member via a dedicated voice session and
 * transcribes it. Because Lavalink holds the guild voice connection while playing, joining
 * here takes it over for the duration of the capture; callers should treat this as a brief
 * push-to-talk window.
 */
export class DiscordVoiceListener {
  public constructor(private readonly stt: SpeechToText) {}

  public async capture(request: VoiceCaptureRequest): Promise<string> {
    const connection = joinVoiceChannel({
      adapterCreator: request.adapterCreator,
      channelId: request.channelId,
      guildId: request.guildId,
      selfDeaf: false,
      selfMute: true,
    });
    try {
      await entersState(connection, VoiceConnectionStatus.Ready, READY_TIMEOUT_MS);
      const opus = connection.receiver.subscribe(request.userId, {
        end: { behavior: EndBehaviorType.AfterSilence, duration: SILENCE_MS },
      });
      const decoder = new prism.opus.Decoder({
        channels: 2,
        frameSize: 960,
        rate: DISCORD_SAMPLE_RATE,
      });
      // Silence the abort/close errors that tearing the streams down raises; the capture
      // is considered empty rather than failed when no one speaks.
      opus.once("error", noop);
      decoder.once("error", noop);
      const stereo = await collect(opus.pipe(decoder), request.maxDurationMs);
      if (stereo.length === 0) {
        return "";
      }
      return await this.stt.transcribe(toMono16k(stereo), TARGET_SAMPLE_RATE);
    } finally {
      connection.destroy();
    }
  }
}

function collect(stream: Readable, maxDurationMs: number): Promise<Buffer> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let settled = false;
    // Resolve on any terminal signal, including the timeout itself. `destroy()` emits
    // `close` (not `end`), and a silent speaker may never emit either, so without the timer
    // resolving directly the capture — and the deferred reply — would hang forever.
    const finish = (): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      stream.destroy();
      resolve(Buffer.concat(chunks));
    };
    const timer = setTimeout(finish, maxDurationMs);
    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    stream.once("end", finish);
    stream.once("close", finish);
    stream.once("error", finish);
  });
}

/**
 * Downmixes 48kHz stereo to 16kHz mono. Each output sample averages a group of DECIMATION
 * stereo frames (a cheap low-pass) instead of dropping samples, which reduces the aliasing
 * noise that hurts recognition.
 */
function toMono16k(stereo: Buffer): Buffer {
  const frames = Math.floor(stereo.length / 4);
  const output = Buffer.alloc(Math.floor(frames / DECIMATION) * 2);
  let offset = 0;
  for (let frame = 0; frame + DECIMATION <= frames; frame += DECIMATION) {
    let sum = 0;
    for (let step = 0; step < DECIMATION; step += 1) {
      const base = (frame + step) * 4;
      sum += (stereo.readInt16LE(base) + stereo.readInt16LE(base + 2)) >> 1;
    }
    output.writeInt16LE(Math.round(sum / DECIMATION), offset);
    offset += 2;
  }
  return output;
}
