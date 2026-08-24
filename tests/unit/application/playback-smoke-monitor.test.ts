import { describe, expect, it, vi } from "vitest";

import type { PlaybackSmokeCheck } from "../../../src/application/diagnostics/playback-smoke-check.js";
import {
  PlaybackSmokeMonitor,
  type SmokeAlertSink,
} from "../../../src/application/diagnostics/playback-smoke-monitor.js";
import type {
  PlaybackCheckResult,
  PlaybackCheckVerdict,
} from "../../../src/domain/diagnostics/playback-check.js";

function result(verdict: PlaybackCheckVerdict): PlaybackCheckResult {
  return {
    detail: `verdict: ${verdict}`,
    durationMs: 100,
    reachedStage: verdict === "passed" ? "stream" : "resolve",
    trackTitle: "Known Track",
    verdict,
  };
}

function monitor(verdicts: readonly PlaybackCheckVerdict[]) {
  const run = vi.fn();
  for (const verdict of verdicts) {
    run.mockResolvedValueOnce(result(verdict));
  }
  const report = vi.fn().mockResolvedValue(undefined);
  const sink: SmokeAlertSink = { report };
  return {
    report,
    subject: new PlaybackSmokeMonitor({ run } as unknown as PlaybackSmokeCheck, sink),
  };
}

describe("PlaybackSmokeMonitor", () => {
  it("alerts once when playback starts failing, not on every run", async () => {
    const { report, subject } = monitor(["failed", "failed", "failed"]);

    await subject.runOnce();
    await subject.runOnce();
    await subject.runOnce();

    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith(expect.objectContaining({ verdict: "failed" }), "failing");
  });

  it("alerts again when playback recovers", async () => {
    const { report, subject } = monitor(["failed", "passed"]);

    await subject.runOnce();
    await subject.runOnce();

    expect(report).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ verdict: "passed" }),
      "recovered",
    );
  });

  it("stays silent while everything keeps working", async () => {
    const { report, subject } = monitor(["passed", "passed"]);

    await subject.runOnce();
    await subject.runOnce();

    expect(report).not.toHaveBeenCalled();
  });

  it("reports each new failure after a recovery", async () => {
    const { report, subject } = monitor(["failed", "passed", "failed"]);

    await subject.runOnce();
    await subject.runOnce();
    await subject.runOnce();

    expect(report).toHaveBeenCalledTimes(3);
  });

  it("treats a skipped run as no information: it neither alerts nor clears", async () => {
    const { report, subject } = monitor(["skipped", "failed", "skipped", "passed"]);

    await subject.runOnce();
    expect(report).not.toHaveBeenCalled();

    await subject.runOnce();
    expect(report).toHaveBeenCalledTimes(1);

    // A skip while failing must not be mistaken for a recovery.
    await subject.runOnce();
    expect(report).toHaveBeenCalledTimes(1);

    await subject.runOnce();
    expect(report).toHaveBeenNthCalledWith(2, expect.anything(), "recovered");
  });

  it("returns the result to the caller regardless of alerting", async () => {
    const { subject } = monitor(["skipped"]);

    await expect(subject.runOnce()).resolves.toMatchObject({ verdict: "skipped" });
  });
});
