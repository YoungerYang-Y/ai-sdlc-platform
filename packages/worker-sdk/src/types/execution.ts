export interface TaskRun {
  id: string;
  workflowRunId: string;
  taskType: TaskType;
  status: TaskRunStatus;
  priority: number;
  maxAttempts: number;
  currentAttemptCount: number;
  timeoutMs: number;
  params: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export type TaskType = "code" | "verify" | "review";

export type TaskRunStatus =
  | "ready"
  | "claimed"
  | "completed"
  | "permanently_failed"
  | "cancelled";

export interface WorkerAttempt {
  id: string;
  taskRunId: string;
  workerId: string;
  implementation: string;
  versionSetId: string;
  status: AttemptStatus;
  attemptNumber: number;
  leaseToken: string;
  leaseExpiresAt: string;
  lastHeartbeatAt: string;
  startedAt: string;
  finishedAt?: string;
  failureType?: FailureType;
  failureReason?: string;
  wasOrphaned: boolean;
}

export type AttemptStatus =
  | "claimed"
  | "running"
  | "completed"
  | "failed"
  | "expired";

export type FailureType =
  | "business_error"
  | "infrastructure_error"
  | "timeout"
  | "cancelled";

export interface ClaimRequest {
  workerId: string;
  supportedTaskTypes: TaskType[];
  implementation: string;
  versionSetId: string;
}

export interface ClaimResponse {
  taskRun: TaskRun;
  attempt: WorkerAttempt;
  leaseToken: string;
  leaseDurationMs: number;
}

export interface HeartbeatRequest {
  attemptId: string;
  leaseToken: string;
  progress?: string;
}

export interface HeartbeatResponse {
  leaseDurationMs: number;
}

export interface CompleteRequest {
  attemptId: string;
  leaseToken: string;
  artifactRefs: string[];
}

export interface FailRequest {
  attemptId: string;
  leaseToken: string;
  failureType: FailureType;
  failureReason: string;
}
