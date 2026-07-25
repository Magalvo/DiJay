import {
  VOICE_COMMAND_PATH,
  VOICE_SECRET_HEADER,
  type VoiceCommandRequestBody,
  type VoiceCommandResponseBody,
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
