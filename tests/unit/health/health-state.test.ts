import { describe, expect, it } from "vitest";

import { HealthState } from "../../../src/infrastructure/health/health-state.js";

describe("HealthState", () => {
  it("is healthy only when Discord and Lavalink are ready", () => {
    const state = new HealthState();

    state.setDiscordReady(true);
    expect(state.snapshot().healthy).toBe(false);

    state.setLavalinkReady(true);
    expect(state.snapshot()).toMatchObject({ healthy: true, status: "ready" });
  });

  it("becomes unhealthy as soon as shutdown starts", () => {
    const state = new HealthState();
    state.setDiscordReady(true);
    state.setLavalinkReady(true);

    state.beginShutdown();

    expect(state.snapshot()).toMatchObject({ healthy: false, status: "shutting_down" });
  });
});
