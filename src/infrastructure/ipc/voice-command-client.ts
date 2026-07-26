import type { VoiceLanguage } from "../../domain/voice/voice-command.js";
import {
  VOICE_COMMAND_PATH,
  VOICE_LANGUAGE_PATH,
  VOICE_SECRET_HEADER,
  type VoiceCommandRequestBody,
  type VoiceCommandResponseBody,
  type VoiceLanguageResponseBody,
} from "./voice-command-contract.js";

export interface VoiceCommandClientConfig {
  readonly secret: string;
  readonly url: string;
}

/**
 * Sends a recognized transcript from the listener sidecar to the main bot over the private
 * network, authenticated with the shared secret. Throws on a non-2xx response so the caller
 * can report the failure without crashing the capture.
 */
export async function forwardVoiceCommand(
  config: VoiceCommandClientConfig,
  payload: VoiceCommandRequestBody,
): Promise<VoiceCommandResponseBody> {
  const response = await fetch(`${config.url}${VOICE_COMMAND_PATH}`, {
    body: JSON.stringify(payload),
    headers: {
      "content-type": "application/json",
      [VOICE_SECRET_HEADER]: config.secret,
    },
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(`Voice command IPC returned ${response.status}`);
  }
  return (await response.json()) as VoiceCommandResponseBody;
}

/**
 * Polls the main bot for the guild's current voice language so the listener can reload its
 * model when it is changed via /settings. Throws on a non-2xx response.
 */
export async function fetchVoiceLanguage(
  config: VoiceCommandClientConfig,
  guildId: string,
): Promise<VoiceLanguage> {
  const response = await fetch(
    `${config.url}${VOICE_LANGUAGE_PATH}?guildId=${encodeURIComponent(guildId)}`,
    { headers: { [VOICE_SECRET_HEADER]: config.secret }, method: "GET" },
  );
  if (!response.ok) {
    throw new Error(`Voice language IPC returned ${response.status}`);
  }
  const body = (await response.json()) as VoiceLanguageResponseBody;
  return body.language;
}
