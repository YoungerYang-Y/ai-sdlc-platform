import { describe, it, expect } from "vitest";
import { createTestContext } from "../src/testing/index.js";
import type { TaskResult } from "../src/types/worker.js";

describe("createTestContext", () => {
  it("creates a usable context with defaults", () => {
    const ctx = createTestContext({});
    expect(ctx.taskRun.id).toBe("task-001");
    expect(ctx.attempt.id).toBe("attempt-001");
    expect(ctx.logger).toBeDefined();
    expect(ctx.abortSignal.aborted).toBe(false);
  });

  it("allows overriding taskRun fields", () => {
    const ctx = createTestContext({
      taskRun: { taskType: "review", params: { patchRef: "patch-001" } },
    });
    expect(ctx.taskRun.taskType).toBe("review");
    expect(ctx.taskRun.params).toEqual({ patchRef: "patch-001" });
  });

  it("supports testing a handler end-to-end", async () => {
    const ctx = createTestContext({ taskRun: { params: { requirement: "add login" } } });

    // Simulate a simple handler
    async function myHandler(ctx: typeof ctx): Promise<TaskResult> {
      ctx.evidence.append("context_loaded", { requirement: (ctx.taskRun.params as any).requirement });
      ctx.evidence.append("tool_called", { tool: "codex", status: "success" });
      return { status: "completed", artifactRefs: ["patch-001"] };
    }

    const result = await myHandler(ctx);

    expect(result.status).toBe("completed");
    expect(result.artifactRefs).toEqual(["patch-001"]);
    expect(ctx.evidence.events).toHaveLength(2);
    expect(ctx.evidence.events[0]!.eventType).toBe("context_loaded");
    expect(ctx.evidence.events[1]!.eventType).toBe("tool_called");
  });
});
