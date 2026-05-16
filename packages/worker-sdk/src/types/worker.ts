import type { TaskRun, TaskType, WorkerAttempt } from "./execution.js";
import type { WorkerImplementation, WorkerRole } from "./identity.js";
import type { Logger } from "./interfaces.js";
import type { EvidenceCollector } from "../framework/evidence-collector.js";

export interface WorkerConfig {
  workerId: string;
  roles: WorkerRole[];
  implementation: WorkerImplementation;
  supportedTaskTypes: TaskType[];
  versionSetId: string;
  scheduler: { baseUrl: string; pollIntervalMs?: number };
  observability: { baseUrl: string; flushIntervalMs?: number; flushBatchSize?: number };
  logger?: Logger;
}

export interface TaskContext {
  taskRun: TaskRun;
  attempt: WorkerAttempt;
  evidence: EvidenceCollector;
  abortSignal: AbortSignal;
  logger: Logger;
}

export interface TaskResult {
  status: "completed" | "failed";
  artifactRefs?: string[];
  failureType?: string;
  failureReason?: string;
  finalConclusion?: string;
}

export interface Worker {
  start(): Promise<void>;
  stop(): Promise<void>;
}
