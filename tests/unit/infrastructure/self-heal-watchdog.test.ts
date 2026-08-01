import { describe, expect, it, vi } from "vitest";

import { SelfHealWatchdog } from "../../../src/infrastructure/health/self-heal-watchdog.js";

function watchdog(isHealthy: () => boolean, onUnhealthy = vi.fn()) {
  let now = 0;
  const advance = (ms: number): void => {
    now += ms;
  };
  const instance = new SelfHealWatchdog({
    gracePeriodMs: 1_000,
    isHealthy,
    now: () => now,
    onUnhealthy,
  });
  return { advance, instance, onUnhealthy };
}

describe("SelfHealWatchdog", () => {
  it("never calls onUnhealthy while healthy", () => {
    const { advance, instance, onUnhealthy } = watchdog(() => true);
    for (let i = 0; i < 5; i += 1) {
      advance(1_000);
      instance.check();
    }
    expect(onUnhealthy).not.toHaveBeenCalled();
  });

  it("does not call onUnhealthy before the grace period elapses", () => {
    const { advance, instance, onUnhealthy } = watchdog(() => false);
    instance.check(); // unhealthySince = 0
    advance(999);
    instance.check();
    expect(onUnhealthy).not.toHaveBeenCalled();
  });

  it("calls onUnhealthy once the grace period elapses, with the elapsed duration", () => {
    const { advance, instance, onUnhealthy } = watchdog(() => false);
    instance.check(); // unhealthySince = 0
    advance(1_000);
    instance.check();
    expect(onUnhealthy).toHaveBeenCalledExactlyOnceWith(1_000);
  });

  it("does not notify again on later checks within the same unhealthy episode", () => {
    const { advance, instance, onUnhealthy } = watchdog(() => false);
    instance.check();
    advance(1_000);
    instance.check();
    advance(1_000);
    instance.check();
    advance(1_000);
    instance.check();
    expect(onUnhealthy).toHaveBeenCalledTimes(1);
  });

  it("can notify again after recovering and becoming unhealthy again", () => {
    let healthy = false;
    const { advance, instance, onUnhealthy } = watchdog(() => healthy);
    instance.check();
    advance(1_000);
    instance.check();
    expect(onUnhealthy).toHaveBeenCalledTimes(1);

    healthy = true;
    instance.check();
    healthy = false;
    instance.check();
    advance(1_000);
    instance.check();
    expect(onUnhealthy).toHaveBeenCalledTimes(2);
  });

  it("start() drives check() on the configured interval and stop() halts it", () => {
    vi.useFakeTimers();
    try {
      const onUnhealthy = vi.fn();
      const instance = new SelfHealWatchdog({
        checkIntervalMs: 100,
        gracePeriodMs: 200,
        isHealthy: () => false,
        onUnhealthy,
      });

      instance.start();
      // Ticks at t=100 (first observed unhealthy, recorded not fired), t=200 (100ms elapsed,
      // still under the 200ms grace period), t=300 (200ms elapsed, fires).
      vi.advanceTimersByTime(300);
      expect(onUnhealthy).toHaveBeenCalledTimes(1);

      instance.stop();
      vi.advanceTimersByTime(10_000);
      expect(onUnhealthy).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
