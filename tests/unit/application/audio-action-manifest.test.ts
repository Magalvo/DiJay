import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { loadAudioActionManifest } from "../../../src/application/audio-actions/audio-action-manifest.js";

async function writeManifest(json: unknown): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "dijay-audio-actions-"));
  const file = join(dir, "actions.json");
  await writeFile(file, JSON.stringify(json), "utf8");
  return file;
}

describe("loadAudioActionManifest", () => {
  it("loads voice-member-join actions from a safe manifest", async () => {
    const file = await writeManifest({
      actions: [
        {
          cooldownSeconds: 86_400,
          file: "greeting.mp3",
          id: "voice_join_greeting",
          message: "Viva, sou o DJ do server.",
          trigger: "voice_member_join",
        },
      ],
    });

    await expect(loadAudioActionManifest(file)).resolves.toEqual({
      actions: [
        {
          cooldownSeconds: 86_400,
          file: "greeting.mp3",
          id: "voice_join_greeting",
          message: "Viva, sou o DJ do server.",
          trigger: "voice_member_join",
        },
      ],
    });
  });

  it("loads voice-listener join and spoken phrase actions from the shared manifest", async () => {
    const file = await writeManifest({
      actions: [
        {
          cooldownSeconds: 86_400,
          file: "greeting.mp3",
          id: "mic_greeting",
          target: "voice_listener",
          trigger: "voice_listener_join",
        },
        {
          cooldownSeconds: 10,
          file: "gelado.mp3",
          id: "gelado",
          phrases: { en: ["gelado"], pt: ["gelado", "quero gelado"] },
          target: "voice_listener",
          trigger: "spoken_phrase",
        },
      ],
    });

    await expect(loadAudioActionManifest(file)).resolves.toEqual({
      actions: [
        {
          cooldownSeconds: 86_400,
          file: "greeting.mp3",
          id: "mic_greeting",
          target: "voice_listener",
          trigger: "voice_listener_join",
        },
        {
          cooldownSeconds: 10,
          file: "gelado.mp3",
          id: "gelado",
          phrases: { en: ["gelado"], pt: ["gelado", "quero gelado"] },
          target: "voice_listener",
          trigger: "spoken_phrase",
        },
      ],
    });
  });

  it("rejects spoken phrase actions without phrases", async () => {
    await expect(
      loadAudioActionManifest(
        await writeManifest({
          actions: [
            {
              cooldownSeconds: 10,
              file: "gelado.mp3",
              id: "gelado",
              target: "voice_listener",
              trigger: "spoken_phrase",
            },
          ],
        }),
      ),
    ).rejects.toThrowError(/phrases/);
  });

  it("rejects path traversal, absolute paths, and unsupported extensions", async () => {
    await expect(
      loadAudioActionManifest(
        await writeManifest({
          actions: [
            {
              cooldownSeconds: 60,
              file: "../secret.mp3",
              id: "bad_path",
              message: "bad",
              trigger: "voice_member_join",
            },
          ],
        }),
      ),
    ).rejects.toThrowError(/file/);

    await expect(
      loadAudioActionManifest(
        await writeManifest({
          actions: [
            {
              cooldownSeconds: 60,
              file: "/tmp/secret.mp3",
              id: "absolute_path",
              message: "bad",
              trigger: "voice_member_join",
            },
          ],
        }),
      ),
    ).rejects.toThrowError(/file/);

    await expect(
      loadAudioActionManifest(
        await writeManifest({
          actions: [
            {
              cooldownSeconds: 60,
              file: "clip.txt",
              id: "bad_extension",
              message: "bad",
              trigger: "voice_member_join",
            },
          ],
        }),
      ),
    ).rejects.toThrowError(/file/);
  });
});
