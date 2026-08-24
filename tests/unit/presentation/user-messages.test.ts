import { describe, expect, it } from "vitest";

import { MusicError } from "../../../src/domain/music/music-error.js";
import {
  musicErrorMessages,
  userFacingMusicError,
} from "../../../src/presentation/discord/user-messages.js";

describe("userFacingMusicError", () => {
  it("maps every known domain error code to its Portuguese message", () => {
    for (const code of Object.keys(musicErrorMessages) as MusicError["code"][]) {
      const message = userFacingMusicError(new MusicError(code, "internal detail"));

      expect(message).toBe(musicErrorMessages[code]);
      expect(message.length).toBeGreaterThan(0);
    }
  });

  it("never leaks internal detail from an unknown error", () => {
    const leaky = new Error("libvosk.so missing at /opt/secret/path; token=abc123");

    const message = userFacingMusicError(leaky);

    expect(message).not.toContain("libvosk");
    expect(message).not.toContain("/opt/secret/path");
    expect(message).not.toContain("abc123");
    expect(message).toBe("Ocorreu um erro inesperado. Tenta novamente dentro de instantes.");
  });

  it("falls back to the generic notice for non-Error values", () => {
    const generic = "Ocorreu um erro inesperado. Tenta novamente dentro de instantes.";

    expect(userFacingMusicError("a string")).toBe(generic);
    expect(userFacingMusicError(null)).toBe(generic);
    expect(userFacingMusicError(undefined)).toBe(generic);
    expect(userFacingMusicError({ code: "NOTHING_PLAYING" })).toBe(generic);
  });

  it("does not use the domain error's own message, only the mapped text", () => {
    const error = new MusicError("NOTHING_PLAYING", "There is no active playback in this server.");

    expect(userFacingMusicError(error)).not.toContain("active playback");
  });
});
