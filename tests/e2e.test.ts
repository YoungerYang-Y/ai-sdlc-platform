import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createOrchestrator } from "../apps/orchestrator/src/index.js";
import { createObservability } from "../packages/observability/src/index.js";
import { createEvaluation } from "../packages/evaluation/src/index.js";
import { createWorker, type TaskContext, type TaskResult } from "../packages/worker-sdk/src/index.js";
import { FileSystemArtifactStore } from "../packages/artifact/src/index.js";
import postgres from "postgres";
import { rmSync } from "node:fs";

const DB_URL = "postgresql://dev:dev@localhost:5432/ai_sdlc";
const ARTIFACT_PATH = "/tmp/e2e-artifacts-" + Date.now();

describe("E2E: code → verify → review → completed", () => {
  let orchestrator: Awaited<ReturnType<typeof createOrchestrator>>;
  let observability: Awaited<ReturnType<typeof createObservability>>;
  let evaluation: ReturnType<typeof createEvaluation>;
  let codeWorkerHandle: { stop(): Promise<void> };
  let reviewWorkerHandle: { stop(): Promise<void> };
  let sql: ReturnType<typeof postgres>;

  beforeAll(async () => {
    sql = postgres(DB_URL);
    // Clean
    await sql`DELETE FROM pending_eval_jobs`;
    await sql`DELETE FROM attempt_scorecard_revisions`;
    await sql`DELETE FROM attempt_scorecards`;
    await sql`DELETE FROM attempt_observability_records`;
    await sql`DELETE FROM attempt_summary_reports`;
    await sql`DELETE FROM attempt_evidence_events`;
    await sql`DELETE FROM artifacts`;
    await sql`DELETE FROM worker_attempts`;
    await sql`DELETE FROM task_runs`;
    await sql`DELETE FROM workflow_runs`;

    // Start services
    observability = createObservability({ port: 18002, connectionString: DB_URL });
    orchestrator = createOrchestrator({
      port: 18000,
      connectionString: DB_URL,
      onAttemptFinished: (id) => void observability.notifyFinished(id),
    });
    evaluation = createEvaluation({ connectionString: DB_URL, pollIntervalMs: 1000 });

    await orchestrator.start();
    await observability.start();
    evaluation.start();

    // Start workers (mock mode, in-process)
    const artifactStore = new FileSystemArtifactStore({ basePath: ARTIFACT_PATH });

    const mockHandler = (role: string) => async (ctx: TaskContext): Promise<TaskResult> => {
      const stepId = (ctx.taskRun.params as any)?.stepId ?? ctx.taskRun.taskType;
      ctx.evidence.append("context_loaded", { stepId, role });
      ctx.evidence.append("tool_called", { toolName: "mock", status: "success" });
      const ref = await artifactStore.write({
        content: `output for ${stepId}`,
        metadata: { artifactType: role === "review" ? "review_report" : "patch", workflowRunId: ctx.taskRun.workflowRunId, taskRunId: ctx.taskRun.id, filename: `${stepId}.txt`, mimeType: "text/plain", sizeBytes: 10 },
      });
      ctx.evidence.append("artifact_written", { ref });
      return { status: "completed", artifactRefs: [ref] };
    };

    const codeWorker = createWorker({
      workerId: "e2e-code", roles: ["code"], implementation: "codex",
      supportedTaskTypes: ["code", "verify"], versionSetId: "00000000-0000-0000-0000-000000000001",
      scheduler: { baseUrl: "http://localhost:18000", pollIntervalMs: 500 },
      observability: { baseUrl: "http://localhost:18002" },
    }, mockHandler("code"));

    const reviewWorker = createWorker({
      workerId: "e2e-review", roles: ["review"], implementation: "claude-code",
      supportedTaskTypes: ["review"], versionSetId: "00000000-0000-0000-0000-000000000001",
      scheduler: { baseUrl: "http://localhost:18000", pollIntervalMs: 500 },
      observability: { baseUrl: "http://localhost:18002" },
    }, mockHandler("review"));

    // Start workers (non-blocking — they run their poll loop)
    codeWorkerHandle = codeWorker;
    reviewWorkerHandle = reviewWorker;
    void codeWorker.start();
    void reviewWorker.start();
  }, 10000);

  afterAll(async () => {
    await codeWorkerHandle?.stop();
    await reviewWorkerHandle?.stop();
    await evaluation?.stop();
    await orchestrator?.stop();
    await observability?.stop();
    await sql?.end();
    rmSync(ARTIFACT_PATH, { recursive: true, force: true });
  });

  it("completes full workflow via workers", async () => {
    // Create workflow
    const res = await fetch("http://localhost:18000/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        versionSetId: "00000000-0000-0000-0000-000000000001",
        triggerType: "manual",
        input: { requirement: "e2e test" },
      }),
    });
    const wf = await res.json() as any;
    expect(wf.status).toBe("running");

    // Poll until completed (max 30s)
    let status = "running";
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const r = await fetch(`http://localhost:18000/workflows/${wf.id}`);
      const data = await r.json() as any;
      status = data.status;
      if (status === "completed" || status === "failed") break;
    }

    expect(status).toBe("completed");
  }, 60000);

  it("recorded observability data", async () => {
    // Wait for observability state machine to settle
    await new Promise((r) => setTimeout(r, 2000));
    const records = await sql`SELECT * FROM attempt_observability_records`;
    expect(records.length).toBe(3); // code, verify, review

    const completeCount = records.filter((r: any) => r.state === "complete").length;
    expect(completeCount).toBe(3);
    expect(records.every((r: any) => r.evidence_count > 0)).toBe(true);
  });

  it("triggered evaluation jobs", async () => {
    const jobs = await sql`SELECT * FROM pending_eval_jobs`;
    expect(jobs.length).toBe(3);
  });

  it("generated scorecards via rule-scorer", async () => {
    // Wait for evaluation polling to process jobs
    await new Promise((r) => setTimeout(r, 3000));
    const scorecards = await sql`SELECT * FROM attempt_scorecards`;
    expect(scorecards.length).toBe(3);
    expect(scorecards.every((s: any) => s.state === "scored")).toBe(true);

    const revisions = await sql`SELECT * FROM attempt_scorecard_revisions`;
    expect(revisions.length).toBe(3);
    expect(revisions.every((r: any) => Number(r.total_score) > 0)).toBe(true);
  });
});
