import type { TaskType } from "@ai-sdlc/worker-sdk";

export interface WorkflowDefinition {
  id: string;
  name: string;
  version: string;
  steps: StepDefinition[];
}

export interface StepDefinition {
  stepId: string;
  taskType: TaskType;
  dependsOn: string[];
  config: StepConfig;
  onFailure: FailureStrategy;
}

export interface StepConfig {
  maxAttempts: number;
  timeoutMs: number;
  params?: Record<string, unknown>;
}

export type FailureStrategy = "fail_workflow" | "skip" | "retry_then_fail";

const DEFAULT_WORKFLOW: WorkflowDefinition = {
  id: "default",
  name: "标准交付流程",
  version: "1.0.0",
  steps: [
    {
      stepId: "code",
      taskType: "code",
      dependsOn: [],
      config: { maxAttempts: 3, timeoutMs: 300000 },
      onFailure: "retry_then_fail",
    },
    {
      stepId: "verify",
      taskType: "verify",
      dependsOn: ["code"],
      config: { maxAttempts: 2, timeoutMs: 300000 },
      onFailure: "retry_then_fail",
    },
    {
      stepId: "review",
      taskType: "review",
      dependsOn: ["verify"],
      config: { maxAttempts: 1, timeoutMs: 300000 },
      onFailure: "fail_workflow",
    },
  ],
};

export function getDefaultWorkflow(): WorkflowDefinition {
  return DEFAULT_WORKFLOW;
}

export function getWorkflow(id: string): WorkflowDefinition {
  if (id === "default") return DEFAULT_WORKFLOW;
  throw new Error(`Workflow "${id}" not found`);
}
