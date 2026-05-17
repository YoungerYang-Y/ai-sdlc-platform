import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { randomUUID } from "node:crypto";
import { createScheduler, createSql, type Scheduler, type SubmitTaskInput } from "@ai-sdlc/scheduler";
import { getWorkflow, type StepDefinition, type WorkflowDefinition } from "@ai-sdlc/workflow";
import type { TaskRun } from "@ai-sdlc/worker-sdk";

// --- Types ---

interface StepParams {
  stepId: string;
  [key: string]: unknown;
}

export interface WorkflowRun {
  id: string;
  versionSetId: string;
  workflowDefinitionId: string;
  status: "created" | "running" | "completed" | "failed" | "cancelled";
  triggerType: string;
  input: Record<string, unknown>;
  currentStepId?: string;
  completedSteps: string[];
  createdAt: string;
}

interface OrchestratorConfig {
  port: number;
  connectionString: string;
  schedulerConfig?: { leaseDefaultMs?: number; leaseScanIntervalMs?: number };
  onAttemptFinished?: (attemptId: string) => void;
  onWorkflowCompleted?: (run: WorkflowRun) => void;
  onWorkflowFailed?: (run: WorkflowRun) => void;
}

// --- Orchestrator ---

export function createOrchestrator(config: OrchestratorConfig) {
  const sql = createSql(config.connectionString);
  let scheduler: Scheduler;

  // Workflow engine
  async function createWorkflowRun(req: { versionSetId: string; triggerType: string; input: Record<string, unknown>; workflowDefinitionId?: string }): Promise<WorkflowRun> {
    const id = randomUUID();
    const defId = req.workflowDefinitionId ?? "default";

    await sql`
      INSERT INTO workflow_runs (id, version_set_id, workflow_definition_id, trigger_type, input, status, completed_steps)
      VALUES (${id}, ${req.versionSetId}, ${defId}, ${req.triggerType}, ${sql.json(req.input as any)}, 'created', ${sql.json([])})
    `;

    const run: WorkflowRun = {
      id, versionSetId: req.versionSetId, workflowDefinitionId: defId,
      status: "created", triggerType: req.triggerType, input: req.input,
      completedSteps: [], createdAt: new Date().toISOString(),
    };

    // Start the workflow
    await advanceWorkflow(run);
    return run;
  }

  async function advanceWorkflow(run: WorkflowRun): Promise<void> {
    const definition = getWorkflow(run.workflowDefinitionId);
    const nextStep = findNextStep(definition, run.completedSteps);

    if (!nextStep) {
      // All steps done
      await sql`UPDATE workflow_runs SET status = 'completed', finished_at = now(), updated_at = now() WHERE id = ${run.id}`;
      run.status = "completed";
      try { config.onWorkflowCompleted?.(run); } catch (err) { console.error("onWorkflowCompleted failed", err); }
      return;
    }

    // Submit task for next step
    await scheduler.submitTask({
      workflowRunId: run.id,
      taskType: nextStep.taskType,
      maxAttempts: nextStep.config.maxAttempts,
      timeoutMs: nextStep.config.timeoutMs,
      params: { ...run.input, stepId: nextStep.stepId },
    });

    await sql`UPDATE workflow_runs SET status = 'running', current_step_id = ${nextStep.stepId}, updated_at = now() WHERE id = ${run.id}`;
    run.status = "running";
    run.currentStepId = nextStep.stepId;
  }

  function findNextStep(def: WorkflowDefinition, completed: string[]): StepDefinition | null {
    for (const step of def.steps) {
      if (completed.includes(step.stepId)) continue;
      if (step.dependsOn.every((d) => completed.includes(d))) return step;
    }
    return null;
  }

  async function handleTaskCompleted(taskRun: TaskRun): Promise<void> {
    const [row] = await sql`SELECT * FROM workflow_runs WHERE id = ${taskRun.workflowRunId}`;
    if (!row) return;

    const stepId = (taskRun.params as StepParams | null)?.stepId;
    if (!stepId) return;

    const prevCompleted: string[] = row.completed_steps ?? [];
    const completed = [...prevCompleted, stepId];
    await sql`UPDATE workflow_runs SET completed_steps = ${sql.json(completed)}, updated_at = now() WHERE id = ${row.id}`;

    const run: WorkflowRun = {
      id: row.id, versionSetId: row.version_set_id, workflowDefinitionId: row.workflow_definition_id,
      status: row.status, triggerType: row.trigger_type, input: row.input as Record<string, unknown>,
      completedSteps: completed, createdAt: row.created_at,
    };
    await advanceWorkflow(run);
  }

  async function handleTaskFailed(taskRun: TaskRun): Promise<void> {
    const [row] = await sql`SELECT * FROM workflow_runs WHERE id = ${taskRun.workflowRunId}`;
    if (!row) return;

    const definition = getWorkflow(row.workflow_definition_id);
    const stepId = (taskRun.params as StepParams | null)?.stepId;
    if (!stepId) return;
    const stepDef = definition.steps.find((s) => s.stepId === stepId);

    if (stepDef?.onFailure === "skip") {
      const prevCompleted: string[] = row.completed_steps ?? [];
      const completed = [...prevCompleted, stepId];
      await sql`UPDATE workflow_runs SET completed_steps = ${sql.json(completed)}, updated_at = now() WHERE id = ${row.id}`;
      const run: WorkflowRun = { id: row.id, versionSetId: row.version_set_id, workflowDefinitionId: row.workflow_definition_id, status: row.status, triggerType: row.trigger_type, input: row.input as Record<string, unknown>, completedSteps: completed, createdAt: row.created_at };
      await advanceWorkflow(run);
    } else {
      await sql`UPDATE workflow_runs SET status = 'failed', finished_at = now(), updated_at = now() WHERE id = ${row.id}`;
      const failedRun: WorkflowRun = { id: row.id, versionSetId: row.version_set_id, workflowDefinitionId: row.workflow_definition_id, status: "failed", triggerType: row.trigger_type, input: row.input as Record<string, unknown>, completedSteps: row.completed_steps ?? [], createdAt: row.created_at };
      try { config.onWorkflowFailed?.(failedRun); } catch (err) { console.error("onWorkflowFailed failed", err); }
    }
  }

  // HTTP API
  const app = new Hono();

  // --- Orchestrator API ---
  app.post("/workflows", async (c) => {
    const body = await c.req.json();
    if (!body.versionSetId || !body.triggerType || !body.input) {
      return c.json({ error: "Missing required fields: versionSetId, triggerType, input" }, 400);
    }
    if (!body.input.requirement) {
      return c.json({ error: "Missing input.requirement" }, 400);
    }
    const run = await createWorkflowRun(body);
    return c.json(run, 201);
  });

  app.get("/workflows/:id", async (c) => {
    const [row] = await sql`SELECT * FROM workflow_runs WHERE id = ${c.req.param("id")}`;
    if (!row) return c.json({ error: "not found" }, 404);
    return c.json(row);
  });

  app.get("/workflows", async (c) => {
    const status = c.req.query("status");
    const limit = Math.min(Number(c.req.query("limit") ?? 50), 100);
    const rows = status
      ? await sql`SELECT id, status, trigger_type, created_at, finished_at, input->>'requirement' as requirement FROM workflow_runs WHERE status = ${status} ORDER BY created_at DESC LIMIT ${limit}`
      : await sql`SELECT id, status, trigger_type, created_at, finished_at, input->>'requirement' as requirement FROM workflow_runs ORDER BY created_at DESC LIMIT ${limit}`;
    return c.json(rows);
  });

  app.get("/artifacts/*", async (c) => {
    const url = new URL(c.req.url);
    const ref = url.pathname.replace("/artifacts/", "");
    if (!ref || ref.includes("..") || ref.startsWith("/")) {
      return c.json({ error: "invalid artifact ref" }, 400);
    }
    const { resolve, join } = await import("node:path");
    const { readFile, readdir } = await import("node:fs/promises");
    const { existsSync } = await import("node:fs");
    const basePath = resolve(process.env.ARTIFACT_PATH ?? "./artifacts");
    const targetPath = resolve(join(basePath, ref));
    if (!targetPath.startsWith(basePath)) {
      return c.json({ error: "access denied" }, 403);
    }
    try {
      // If exact file, return it
      if (existsSync(targetPath) && (await import("node:fs")).statSync(targetPath).isFile()) {
        const content = await readFile(targetPath, "utf-8");
        const ext = ref.split(".").pop();
        const contentType = ext === "md" ? "text/markdown" : ext === "diff" ? "text/x-diff" : "text/plain";
        return c.text(content, 200, { "Content-Type": contentType });
      }
      // If directory prefix, find first file recursively
      if (existsSync(targetPath)) {
        const files = await findFiles(targetPath);
        if (files.length > 0) {
          const content = await readFile(files[0]!, "utf-8");
          const ext = files[0]!.split(".").pop();
          const contentType = ext === "md" ? "text/markdown" : ext === "diff" ? "text/x-diff" : "text/plain";
          return c.text(content, 200, { "Content-Type": contentType });
        }
      }
      return c.json({ error: "artifact not found" }, 404);
    } catch {
      return c.json({ error: "artifact not found" }, 404);
    }
  });

  async function findFiles(dir: string): Promise<string[]> {
    const { readdir, stat } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const entries = await readdir(dir);
    const results: string[] = [];
    for (const entry of entries) {
      const full = join(dir, entry);
      const s = await stat(full);
      if (s.isFile()) results.push(full);
      else if (s.isDirectory()) results.push(...await findFiles(full));
    }
    return results;
  }

  app.post("/workflows/:id/cancel", async (c) => {
    await sql`UPDATE workflow_runs SET status = 'cancelled', finished_at = now(), updated_at = now() WHERE id = ${c.req.param("id")}`;
    return c.json({ ok: true });
  });

  // --- Scheduler API (Worker-facing) ---
  app.post("/tasks/claim", async (c) => {
    const body = await c.req.json();
    const result = await scheduler.handleClaim(body);
    if (!result) return c.body(null, 204);
    return c.json(result);
  });

  app.post("/attempts/:id/heartbeat", async (c) => {
    const { leaseToken } = await c.req.json();
    try {
      const result = await scheduler.handleHeartbeat(c.req.param("id"), leaseToken);
      return c.json(result);
    } catch {
      return c.json({ error: "lease expired" }, 409);
    }
  });

  app.post("/attempts/:id/complete", async (c) => {
    const { leaseToken, artifactRefs } = await c.req.json();
    await scheduler.handleComplete(c.req.param("id"), leaseToken, artifactRefs ?? []);
    return c.json({ ok: true });
  });

  app.post("/attempts/:id/fail", async (c) => {
    const { leaseToken, failureType, failureReason } = await c.req.json();
    await scheduler.handleFail(c.req.param("id"), leaseToken, failureType, failureReason);
    return c.json({ ok: true });
  });

  return {
    async start() {
      scheduler = createScheduler({
        connectionString: config.connectionString,
        ...config.schedulerConfig,
        onTaskCompleted: (t) => void handleTaskCompleted(t).catch((err) => console.error("handleTaskCompleted failed", err)),
        onTaskFailed: (t) => void handleTaskFailed(t).catch((err) => console.error("handleTaskFailed failed", err)),
        onAttemptFinished: config.onAttemptFinished,
      });
      await scheduler.start();
      serve({ fetch: app.fetch, port: config.port });
      console.log(`Orchestrator running on :${config.port}`);
    },
    async stop() {
      await scheduler.stop();
      await sql.end();
    },
    app, // for testing
  };
}
