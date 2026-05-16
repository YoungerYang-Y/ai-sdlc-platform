import type { TaskRun, WorkerAttempt } from "../types/execution.js";
import type { AttemptEvidenceEvent, AttemptSummaryReport } from "../types/observability.js";
import type { Logger, ObservabilityReporter } from "../types/interfaces.js";
import type { TaskContext } from "../types/worker.js";
import { EvidenceCollector } from "../framework/evidence-collector.js";

/** InMemory ObservabilityReporter for testing */
export class InMemoryObservabilityReporter implements ObservabilityReporter {
  readonly events: AttemptEvidenceEvent[] = [];
  readonly summaries: AttemptSummaryReport[] = [];

  appendEvent(event: AttemptEvidenceEvent): void {
    this.events.push(event);
  }

  async sendSummary(report: AttemptSummaryReport): Promise<void> {
    this.summaries.push(report);
  }

  async flush(): Promise<void> {
    // no-op in memory
  }
}

/** Silent logger for tests */
export const silentLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

/** Create a TaskContext for unit testing Worker handlers */
export function createTestContext(opts: {
  taskRun?: Partial<TaskRun>;
  attempt?: Partial<WorkerAttempt>;
}): TaskContext {
  const taskRun: TaskRun = {
    id: "task-001",
    workflowRunId: "wf-001",
    taskType: "code",
    status: "claimed",
    priority: 0,
    maxAttempts: 3,
    currentAttemptCount: 1,
    timeoutMs: 300000,
    params: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...opts.taskRun,
  };

  const attempt: WorkerAttempt = {
    id: "attempt-001",
    taskRunId: taskRun.id,
    workerId: "test-worker",
    implementation: "codex",
    versionSetId: "vs-001",
    status: "claimed",
    attemptNumber: 1,
    leaseToken: "token-001",
    leaseExpiresAt: new Date(Date.now() + 300000).toISOString(),
    lastHeartbeatAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
    wasOrphaned: false,
    ...opts.attempt,
  };

  const reporter = new InMemoryObservabilityReporter();
  const evidence = new EvidenceCollector({
    attemptId: attempt.id,
    reporter,
    flushBatchSize: 100,
    flushIntervalMs: 999999,
    maxBufferSize: 1000,
  });

  return {
    taskRun,
    attempt,
    evidence,
    abortSignal: new AbortController().signal,
    logger: silentLogger,
  };
}
