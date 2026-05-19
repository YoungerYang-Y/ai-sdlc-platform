export interface WorkflowRun {
  id: string;
  versionSetId: string;
  workflowDefinitionId: string;
  status: "created" | "running" | "completed" | "failed" | "cancelled" | "pending_approval";
  triggerType: string;
  input: Record<string, unknown>;
  currentStepId?: string;
  completedSteps: string[];
  createdAt: string;
}

export interface OrchestratorConfig {
  port: number;
  connectionString: string;
  schedulerConfig?: { leaseDefaultMs?: number; leaseScanIntervalMs?: number };
  onAttemptFinished?: (attemptId: string) => void;
  onWorkflowCompleted?: (run: WorkflowRun) => void;
  onWorkflowFailed?: (run: WorkflowRun) => void;
}
