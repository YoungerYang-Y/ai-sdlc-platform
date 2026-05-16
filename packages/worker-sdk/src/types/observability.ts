export type EvidenceEventType =
  | "context_loaded"
  | "reasoning_checkpoint"
  | "tool_called"
  | "artifact_written"
  | "token_updated"
  | "attempt_finished";

export interface AttemptEvidenceEvent {
  eventId: string;
  attemptId: string;
  sequenceNo: number;
  eventType: EvidenceEventType;
  occurredAt: string;
  payloadRef?: string;
  payload?: unknown;
}

export interface AttemptSummaryReport {
  attemptId: string;
  taskRunId: string;
  workerId: string;
  versionSetId: string;
  finalStatus: "completed" | "failed" | "expired";
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  tokenTotals: TokenTotals;
  costTotals: CostTotals;
  toolStats: ToolStats;
  artifactRefs: string[];
  failureType?: string;
  failureReason?: string;
  checkpointDigest: string;
  finalConclusion: string;
}

export interface TokenTotals {
  input: number;
  output: number;
  total: number;
}

export interface CostTotals {
  totalUsd: number;
}

export interface ToolStats {
  totalCalls: number;
  successCount: number;
  failedCount: number;
}

export interface StructuredCheckpoint {
  goal: string;
  hypothesis: string;
  decision: string;
  evidence: string;
  nextStep: string;
  risk: string;
}

export interface ToolCalledPayload {
  toolName: string;
  startedAt: string;
  finishedAt: string;
  status: "success" | "failed";
  argsSummary?: string;
  resultSummary?: string;
  errorSummary?: string;
  artifactRefs: string[];
}
