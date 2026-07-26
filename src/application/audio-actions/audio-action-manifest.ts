import { extname, isAbsolute, normalize, sep } from "node:path";
import { readFile } from "node:fs/promises";

import { z } from "zod";

const allowedAudioExtensions = new Set([".mp3", ".ogg", ".wav"]);

const actionSchema = z.object({
  cooldownSeconds: z
    .number()
    .int()
    .min(0)
    .max(86_400 * 365),
  file: z.string().trim().min(1).refine(isSafeAudioFile, {
    message: "file must be a relative .mp3, .ogg, or .wav path without traversal",
  }),
  id: z
    .string()
    .trim()
    .regex(/^[a-z0-9_-]{1,64}$/),
  message: z.string().trim().min(1).max(2_000),
  trigger: z.literal("voice_member_join"),
});

const manifestSchema = z.object({
  actions: z.array(actionSchema).max(50),
});

export type AudioActionTrigger = "voice_member_join";

export interface AudioActionDefinition {
  readonly cooldownSeconds: number;
  readonly file: string;
  readonly id: string;
  readonly message: string;
  readonly trigger: AudioActionTrigger;
}

export interface AudioActionManifest {
  readonly actions: readonly AudioActionDefinition[];
}

export async function loadAudioActionManifest(path: string): Promise<AudioActionManifest> {
  const parsedJson = JSON.parse(await readFile(path, "utf8")) as unknown;
  const result = manifestSchema.safeParse(parsedJson);
  if (!result.success) {
    const fields = result.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Invalid audio action manifest: ${fields}`);
  }
  return result.data;
}

export function isSafeAudioFile(file: string): boolean {
  if (isAbsolute(file)) {
    return false;
  }
  const normalized = normalize(file);
  if (normalized === "." || normalized === ".." || normalized.startsWith(`..${sep}`)) {
    return false;
  }
  return allowedAudioExtensions.has(extname(normalized).toLowerCase());
}
