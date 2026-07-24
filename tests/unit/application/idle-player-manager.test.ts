import { afterEach, describe, expect, it, vi } from "vitest";

import { IdlePlayerManager } from "../../../src/application/music/idle-player-manager.js";

describe("IdlePlayerManager", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs the latest scheduled callback after the configured delay", async () => {
    vi.useFakeTimers();
    const manager = new IdlePlayerManager();
    const first = vi.fn();
    const latest = vi.fn();

    manager.schedule("guild-1", 300, first);
    manager.schedule("guild-1", 30, latest);
    await vi.advanceTimersByTimeAsync(30_000);

    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledOnce();
    expect(manager.has("guild-1")).toBe(false);
  });

  it("cancels pending cleanup when playback restarts", async () => {
    vi.useFakeTimers();
    const manager = new IdlePlayerManager();
    const cleanup = vi.fn();

    manager.schedule("guild-1", 30, cleanup);
    manager.cancel("guild-1");
    await vi.advanceTimersByTimeAsync(30_000);

    expect(cleanup).not.toHaveBeenCalled();
  });
});
