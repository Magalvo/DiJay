import { describe, expect, it } from "vitest";

import { formatDuration, formatQueue } from "../../../src/presentation/discord/music-formatters.js";

describe("music formatters", () => {
  it("formats durations and live streams", () => {
    expect(formatDuration(65_000, false)).toBe("1:05");
    expect(formatDuration(3_665_000, false)).toBe("1:01:05");
    expect(formatDuration(0, true)).toBe("LIVE");
  });

  it("bounds queue output and reports omitted entries", () => {
    const tracks = Array.from({ length: 15 }, (_, index) => ({
      author: "Artist",
      durationMs: 180_000,
      isStream: false,
      title: `Track ${index + 1}`,
      uri: `https://example.test/${index + 1}`,
    }));

    const output = formatQueue({ current: tracks[0]!, upcoming: tracks.slice(1) }, 5);

    expect(output).toContain("Now playing");
    expect(output).toContain("Track 5");
    expect(output).toContain("…and 10 more");
    expect(output).not.toContain("Track 15");
  });
});
