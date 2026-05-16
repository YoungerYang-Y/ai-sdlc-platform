import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createScheduler } from "../src/index.js";
import postgres from "postgres";

const DB_URL = "postgresql://dev:dev@localhost:5432/ai_sdlc";
const WF_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

describe("Scheduler", () => {
  let scheduler: ReturnType<typeof createScheduler>;
  let onCompleted: ReturnType<typeof vi.fn>;
  let onFailed: ReturnType<typeof vi.fn>;
  let sql: ReturnType<typeof postgres>;

  beforeEach(async () => {
    sql = postgres(DB_URL);
    await sql`DELETE FROM pending_eval_jobs`;
    await sql`DELETE FROM attempt_observability_records`;
    await sql`DELETE FROM attempt_summary_reports`;
    await sql`DELETE FROM attempt_evidence_events`;
    await sql`DELETE FROM artifacts`;
    await sql`DELETE FROM worker_attempts`;
    await sql`DELETE FROM task_runs`;
    await sql`DELETE FROM workflow_runs`;
    await sql`INSERT INTO workflow_runs (id, version_set_id, trigger_type, input, status, completed_steps)
      VALUES (${WF_ID}, ${"00000000-0000-0000-0000-000000000001"}, ${"manual"}, ${sql.json({r:"test"})}, ${"running"}, ${sql.json([])})`;

    onCompleted = vi.fn();
    onFailed = vi.fn();
    scheduler = createScheduler({ connectionString: DB_URL, onTaskCompleted: onCompleted, onTaskFailed: onFailed });
  });

  afterEach(async () => {
    await scheduler.stop();
    await sql.end();
  });

  it("submit creates a ready task", async () => {
    const task = await scheduler.submitTask({ workflowRunId: WF_ID, taskType: "code", params: { x: 1 } });
    expect(task.status).toBe("ready");
    expect(task.taskType).toBe("code");
  });

  it("claim returns task and creates attempt", async () => {
    await scheduler.submitTask({ workflowRunId: WF_ID, taskType: "code" });
    const claim = await scheduler.handleClaim({ workerId: "w1", supportedTaskTypes: ["code"], implementation: "codex", versionSetId: "00000000-0000-0000-0000-000000000001" });
    expect(claim).not.toBeNull();
    expect(claim!.taskRun.taskType).toBe("code");
    expect(claim!.attempt.status).toBe("claimed");
  });

  it("claim returns null when no matching tasks", async () => {
    await scheduler.submitTask({ workflowRunId: WF_ID, taskType: "code" });
    const claim = await scheduler.handleClaim({ workerId: "w1", supportedTaskTypes: ["review"], implementation: "codex", versionSetId: "00000000-0000-0000-0000-000000000001" });
    expect(claim).toBeNull();
  });

  it("complete marks task completed and triggers callback", async () => {
    await scheduler.submitTask({ workflowRunId: WF_ID, taskType: "code" });
    const claim = await scheduler.handleClaim({ workerId: "w1", supportedTaskTypes: ["code"], implementation: "codex", versionSetId: "00000000-0000-0000-0000-000000000001" });
    await scheduler.handleComplete(claim!.attempt.id, claim!.leaseToken, []);
    expect(onCompleted).toHaveBeenCalledTimes(1);
    const task = await scheduler.getTaskStatus(claim!.taskRun.id);
    expect(task!.status).toBe("completed");
  });

  it("business_error does NOT retry → permanently_failed", async () => {
    await scheduler.submitTask({ workflowRunId: WF_ID, taskType: "code", maxAttempts: 3 });
    const claim = await scheduler.handleClaim({ workerId: "w1", supportedTaskTypes: ["code"], implementation: "codex", versionSetId: "00000000-0000-0000-0000-000000000001" });
    await scheduler.handleFail(claim!.attempt.id, claim!.leaseToken, "business_error", "code is wrong");
    expect(onFailed).toHaveBeenCalledTimes(1);
    const task = await scheduler.getTaskStatus(claim!.taskRun.id);
    expect(task!.status).toBe("permanently_failed");
  });

  it("infrastructure_error retries (task back to ready)", async () => {
    await scheduler.submitTask({ workflowRunId: WF_ID, taskType: "code", maxAttempts: 3 });
    const claim = await scheduler.handleClaim({ workerId: "w1", supportedTaskTypes: ["code"], implementation: "codex", versionSetId: "00000000-0000-0000-0000-000000000001" });
    await scheduler.handleFail(claim!.attempt.id, claim!.leaseToken, "infrastructure_error", "timeout");
    expect(onFailed).not.toHaveBeenCalled();
    const task = await scheduler.getTaskStatus(claim!.taskRun.id);
    expect(task!.status).toBe("ready");
  });

  it("retries exhaust → permanently_failed", async () => {
    await scheduler.submitTask({ workflowRunId: WF_ID, taskType: "code", maxAttempts: 2 });
    const c1 = await scheduler.handleClaim({ workerId: "w1", supportedTaskTypes: ["code"], implementation: "codex", versionSetId: "00000000-0000-0000-0000-000000000001" });
    await scheduler.handleFail(c1!.attempt.id, c1!.leaseToken, "infrastructure_error", "fail 1");
    const c2 = await scheduler.handleClaim({ workerId: "w1", supportedTaskTypes: ["code"], implementation: "codex", versionSetId: "00000000-0000-0000-0000-000000000001" });
    await scheduler.handleFail(c2!.attempt.id, c2!.leaseToken, "infrastructure_error", "fail 2");
    expect(onFailed).toHaveBeenCalledTimes(1);
    const task = await scheduler.getTaskStatus(c1!.taskRun.id);
    expect(task!.status).toBe("permanently_failed");
  });
});
