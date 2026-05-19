import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { WorkflowRun } from "./index.js";

export function mapWorkflowRun(row: any): WorkflowRun {
  return {
    id: row.id,
    versionSetId: row.version_set_id,
    workflowDefinitionId: row.workflow_definition_id,
    status: row.status,
    triggerType: row.trigger_type,
    input: row.input as Record<string, unknown>,
    completedSteps: row.completed_steps ?? [],
    currentStepId: row.current_step_id,
    createdAt: row.created_at,
  };
}

export async function findFiles(dir: string): Promise<string[]> {
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
