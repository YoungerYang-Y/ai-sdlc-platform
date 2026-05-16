import { describe, it, expect, vi, afterEach } from "vitest";
import { EvidenceCollector } from "../src/framework/evidence-collector.js";
import { InMemoryObservabilityReporter } from "../src/testing/index.js";

describe("EvidenceCollector", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("assigns incrementing sequence numbers", () => {
    const reporter = new InMemoryObservabilityReporter();
    const collector = new EvidenceCollector({
      attemptId: "a1",
      reporter,
      flushBatchSize: 100,
      flushIntervalMs: 999999,
      maxBufferSize: 100,
    });

    collector.append("context_loaded", { files: ["a.ts"] });
    collector.append("tool_called", { tool: "codex" });
    collector.append("token_updated", { input: 100 });

    expect(collector.events).toHaveLength(3);
    expect(collector.events[0]!.sequenceNo).toBe(0);
    expect(collector.events[1]!.sequenceNo).toBe(1);
    expect(collector.events[2]!.sequenceNo).toBe(2);
    collector.stop();
  });

  it("generates correct eventId format", () => {
    const reporter = new InMemoryObservabilityReporter();
    const collector = new EvidenceCollector({
      attemptId: "attempt-xyz",
      reporter,
      flushBatchSize: 100,
      flushIntervalMs: 999999,
      maxBufferSize: 100,
    });

    collector.append("context_loaded", {});
    expect(collector.events[0]!.eventId).toBe("attempt-xyz-0-context_loaded");
    collector.stop();
  });

  it("drops events when buffer is full", () => {
    const reporter = new InMemoryObservabilityReporter();
    const collector = new EvidenceCollector({
      attemptId: "a1",
      reporter,
      flushBatchSize: 100,
      flushIntervalMs: 999999,
      maxBufferSize: 3,
    });

    collector.append("context_loaded", {});
    collector.append("tool_called", {});
    collector.append("token_updated", {});
    collector.append("artifact_written", {}); // should be dropped

    expect(collector.events).toHaveLength(3);
    collector.stop();
  });

  it("forwards events to reporter", () => {
    const reporter = new InMemoryObservabilityReporter();
    const collector = new EvidenceCollector({
      attemptId: "a1",
      reporter,
      flushBatchSize: 100,
      flushIntervalMs: 999999,
      maxBufferSize: 100,
    });

    collector.append("context_loaded", { x: 1 });
    expect(reporter.events).toHaveLength(1);
    expect(reporter.events[0]!.eventType).toBe("context_loaded");
    collector.stop();
  });
});
