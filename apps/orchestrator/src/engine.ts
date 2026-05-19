import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import type { Scheduler } from "@ai-sdlc/scheduler";
import { getWorkflow, type StepDefinition, type WorkflowDefinition } from "@ai-sdlc/workflow";
import type { TaskRun } from "@ai-sdlc/worker-sdk";
import type { WorkflowRun, OrchestratorConfig } from "./index.js";
import { mapWorkflowRun } from "./helpers.js";

interface StepParams { stepId: string; [key: string]: unknown; }

export function createWorkflowEngine(sql: postgres.Sql, getScheduler: () => Scheduler, config: OrchestratorConfig) {

  async function createWorkflowRun(req: { versionSetId: string; triggerType: string; input: Record<string, unknown>; workflowDefinitionId?: string }): Promise<WorkflowRun> {
    const id = randomUUID();
    const defId = req.workflowDefinitionId ?? "default";
    await sql`
      INSERT INTO workflow_runs (id, version_set_id, workflow_definition_id, trigger_type, input, status, completed_steps)
      VALUES (${id}, ${req.versionSetId}, ${defId}, ${req.triggerType}, ${sql.json(req.input as any)}, 'created', ${sql.json([])})
    `;
    const run: WorkflowRun = { id, versionSetId: req.versionSetId, workflowDefinitionId: defId, status: "created", triggerType: req.triggerType, input: req.input, completedSteps: [], createdAt: new Date().toISOString() };
    await advanceWorkflow(run);
    return run;
  }

  async function advanceWorkflow(run: WorkflowRun): Promise<void> {
    const definition = getWorkflow(run.workflowDefinitionId);
    const nextStep = findNextStep(definition, run.completedSteps);

    if (!nextStep) {
      if (run.triggerType === "manual") {
        await sql`UPDATE workflow_runs SET status = 'pending_approval', updated_at = now() WHERE id = ${run.id}`;
        run.status = "pending_approval";
        return;
      }
      await sql`UPDATE workflow_runs SET status = 'completed', finished_at = now(), updated_at = now() WHERE id = ${run.id}`;
      run.status = "completed";
      try { config.onWorkflowCompleted?.(run); } catch (err) { console.error("onWorkflowCompleted failed", err); }
      return;
    }

    await getScheduler().submitTask({
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
    const completed = [...(row.completed_steps ?? []), stepId];
    await sql`UPDATE workflow_runs SET completed_steps = ${sql.json(completed)}, updated_at = now() WHERE id = ${row.id}`;
    await advanceWorkflow(mapWorkflowRun({ ...row, completed_steps: completed }));
  }

  async function handleTaskFailed(taskRun: TaskRun): Promise<void> {
    const [row] = await sql`SELECT * FROM workflow_runs WHERE id = ${taskRun.workflowRunId}`;
    if (!row) return;
    const definition = getWorkflow(row.workflow_definition_id);
    const stepId = (taskRun.params as StepParams | null)?.stepId;
    if (!stepId) return;
    const stepDef = definition.steps.find((s) => s.stepId === stepId);

    if (stepDef?.onFailure === "skip") {
      const completed = [...(row.completed_steps ?? []), stepId];
      await sql`UPDATE workflow_runs SET completed_steps = ${sql.json(completed)}, updated_at = now() WHERE id = ${row.id}`;
      await advanceWorkflow(mapWorkflowRun({ ...row, completed_steps: completed }));
    } else {
      await sql`UPDATE workflow_runs SET status = 'failed', finished_at = now(), updated_at = now() WHERE id = ${row.id}`;
      try { config.onWorkflowFailed?.(mapWorkflowRun({ ...row, status: "failed" })); } catch (err) { console.error("onWorkflowFailed failed", err); }
    }
  }

  return { createWorkflowRun, handleTaskCompleted, handleTaskFailed };
}
