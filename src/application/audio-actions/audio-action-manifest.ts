import { extname, isAbsolute, normalize, sep } from "node:path";
import { readFile } from "node:fs/promises";

import { z } from "zod";

const allowedAudioExtensions = new Set([".mp3", ".ogg", ".wav"]);

const baseActionSchema = z.object({
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
});

const mainBotVoiceMemberJoinActionSchema = baseActionSchema.extend({
  message: z.string().trim().min(1).max(2_000),
  target: z.literal("main_bot").optional(),
  trigger: z.literal("voice_member_join"),
});

const voiceListenerJoinActionSchema = baseActionSchema.extend({
  target: z.literal("voice_listener"),
  trigger: z.literal("voice_listener_join"),
});

const voiceListenerMemberJoinActionSchema = baseActionSchema.extend({
  target: z.literal("voice_listener"),
  trigger: z.literal("voice_listener_member_join"),
});

const phraseMapSchema = z
  .object({
    en: z.array(z.string().trim().min(1)).optional(),
    pt: z.array(z.string().trim().min(1)).optional(),
  })
  .strict()
  .refine(
    (phrases) => (phrases.en?.length ?? 0) > 0 || (phrases.pt?.length ?? 0) > 0,
    "phrases must include at least one language with one phrase",
  );

const voiceListenerSpokenPhraseActionSchema = baseActionSchema.extend({
  phrases: phraseMapSchema,
  target: z.literal("voice_listener"),
  trigger: z.literal("spoken_phrase"),
});

const actionSchema = z.discriminatedUnion("trigger", [
  mainBotVoiceMemberJoinActionSchema,
  voiceListenerJoinActionSchema,
  voiceListenerMemberJoinActionSchema,
  voiceListenerSpokenPhraseActionSchema,
]);

const manifestSchema = z.object({
  actions: z.array(actionSchema).max(50),
});

export type AudioActionTarget = "main_bot" | "voice_listener";
export type AudioActionTrigger =
  "spoken_phrase" | "voice_listener_join" | "voice_listener_member_join" | "voice_member_join";

export type MainBotAudioActionDefinition = z.infer<typeof mainBotVoiceMemberJoinActionSchema>;
export type VoiceListenerJoinAudioActionDefinition = z.infer<typeof voiceListenerJoinActionSchema>;
export type VoiceListenerMemberJoinAudioActionDefinition = z.infer<
  typeof voiceListenerMemberJoinActionSchema
>;
export type VoiceListenerSpokenPhraseAudioActionDefinition = z.infer<
  typeof voiceListenerSpokenPhraseActionSchema
>;
export type VoiceListenerAudioActionDefinition =
  | VoiceListenerJoinAudioActionDefinition
  | VoiceListenerMemberJoinAudioActionDefinition
  | VoiceListenerSpokenPhraseAudioActionDefinition;
export type AudioActionDefinition = z.infer<typeof actionSchema>;

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
