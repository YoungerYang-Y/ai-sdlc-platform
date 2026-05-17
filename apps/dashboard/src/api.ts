const BASE = "/api";

export interface WorkflowSummary {
  id: string;
  status: string;
  trigger_type: string;
  created_at: string;
  finished_at: string | null;
  requirement: string | null;
}

export interface WorkflowDetail {
  id: string;
  status: string;
  trigger_type: string;
  input: Record<string, unknown>;
  completed_steps: string[];
  current_step_id: string | null;
  created_at: string;
  finished_at: string | null;
}

export interface TaskRun {
  id: string;
  task_type: string;
  status: string;
  current_attempt_count: number;
  params: Record<string, unknown> | null;
  created_at: string;
}

export interface Attempt {
  id: string;
  task_run_id: string;
  worker_id: string;
  implementation: string;
  status: string;
  failure_type: string | null;
  failure_reason: string | null;
  started_at: string | null;
  finished_at: string | null;
}

export async function fetchWorkflows(status?: string): Promise<WorkflowSummary[]> {
  const params = status ? `?status=${status}` : "";
  const res = await fetch(`${BASE}/workflows${params}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function fetchWorkflow(id: string): Promise<WorkflowDetail> {
  const res = await fetch(`${BASE}/workflows/${id}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function fetchTasks(workflowId: string): Promise<TaskRun[]> {
  // Tasks are embedded in workflow query via separate endpoint
  // For now, we use a direct DB query endpoint — simplified: fetch from /tasks?workflow_run_id=
  // Actually not available yet, so we'll get task info from attempts
  // TODO: Add GET /tasks?workflow_run_id= API
  return [];
}

export async function fetchArtifact(ref: string): Promise<string> {
  const res = await fetch(`${BASE}/artifacts/${ref}`);
  if (!res.ok) throw new Error(`Artifact not found`);
  return res.text();
}

export async function createWorkflow(input: {
  requirement: string;
  repository?: string;
  branch?: string;
  workDir?: string;
  verifyCommand?: string;
  triggerType?: string;
}): Promise<WorkflowDetail> {
  const res = await fetch(`${BASE}/workflows`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      versionSetId: "00000000-0000-0000-0000-000000000001",
      triggerType: input.triggerType ?? "manual",
      input: {
        requirement: input.requirement,
        repository: input.repository || undefined,
        branch: input.branch || undefined,
        workDir: input.workDir || undefined,
        verifyCommand: input.verifyCommand || undefined,
      },
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(err.error ?? `API error: ${res.status}`);
  }
  return res.json();
}
