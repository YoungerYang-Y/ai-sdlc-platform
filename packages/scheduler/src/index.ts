import { randomUUID } from "node:crypto";
import type { TaskRun, WorkerAttempt, TaskType, ClaimRequest, ClaimResponse, FailureType } from "@ai-sdlc/worker-sdk";
import { SchedulerRepository, createSql } from "./repository.js";

export interface SchedulerConfig {
  connectionString: string;
  leaseDefaultMs?: number;
  leaseScanIntervalMs?: number;
  defaultMaxAttempts?: number;
  onTaskCompleted: (taskRun: TaskRun) => void;
  onTaskFailed: (taskRun: TaskRun) => void;
}

export interface SubmitTaskInput {
  workflowRunId: string;
  taskType: TaskType;
  maxAttempts?: number;
  timeoutMs?: number;
  params?: Record<string, unknown>;
}

export interface Scheduler {
  submitTask(input: SubmitTaskInput): Promise<TaskRun>;
  cancelTask(taskRunId: string): Promise<void>;
  getTaskStatus(taskRunId: string): Promise<TaskRun | null>;
  listTasksByWorkflow(workflowRunId: string): Promise<TaskRun[]>;
  handleClaim(req: ClaimRequest): Promise<ClaimResponse | null>;
  handleHeartbeat(attemptId: string, leaseToken: string): Promise<{ leaseDurationMs: number }>;
  handleComplete(attemptId: string, leaseToken: string, artifactRefs: string[]): Promise<void>;
  handleFail(attemptId: string, leaseToken: string, failureType: FailureType, failureReason: string): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export function createScheduler(config: SchedulerConfig): Scheduler {
  const leaseDefaultMs = config.leaseDefaultMs ?? 300000;
  const leaseScanIntervalMs = config.leaseScanIntervalMs ?? 30000;
  const defaultMaxAttempts = config.defaultMaxAttempts ?? 3;

  const sql = createSql(config.connectionString);
  const repo = new SchedulerRepository(sql);
  let scanTimer: ReturnType<typeof setInterval> | null = null;

  async function submitTask(input: SubmitTaskInput): Promise<TaskRun> {
    return repo.createTaskRun({
      workflowRunId: input.workflowRunId,
      taskType: input.taskType,
      maxAttempts: input.maxAttempts ?? defaultMaxAttempts,
      timeoutMs: input.timeoutMs ?? leaseDefaultMs,
      params: input.params,
    });
  }

  async function cancelTask(taskRunId: string): Promise<void> {
    await repo.updateTaskStatus(taskRunId, "cancelled");
  }

  async function handleClaim(req: ClaimRequest): Promise<ClaimResponse | null> {
    return sql.begin(async (tx) => {
      const txRepo = new SchedulerRepository(tx);
      const taskRun = await txRepo.findAndLockReadyTask(req.supportedTaskTypes);
      if (!taskRun) return null;

      await txRepo.updateTaskStatus(taskRun.id, "claimed");

      const attempt = await txRepo.createAttempt({
        taskRunId: taskRun.id,
        workerId: req.workerId,
        implementation: req.implementation,
        versionSetId: req.versionSetId,
        attemptNumber: taskRun.currentAttemptCount + 1,
        leaseToken: randomUUID(),
        leaseExpiresAt: new Date(Date.now() + leaseDefaultMs),
      });

      await txRepo.incrementAttemptCount(taskRun.id);

      return { taskRun, attempt, leaseToken: attempt.leaseToken, leaseDurationMs: leaseDefaultMs };
    });
  }

  async function handleHeartbeat(attemptId: string, leaseToken: string): Promise<{ leaseDurationMs: number }> {
    await repo.setAttemptRunning(attemptId);
    const renewed = await repo.renewLease(attemptId, leaseToken, new Date(Date.now() + leaseDefaultMs));
    if (!renewed) throw new Error("LEASE_EXPIRED");
    return { leaseDurationMs: leaseDefaultMs };
  }

  async function handleComplete(attemptId: string, leaseToken: string, artifactRefs: string[]): Promise<void> {
    const attempt = await repo.findAttempt(attemptId);
    if (!attempt || attempt.leaseToken !== leaseToken) throw new Error("INVALID_LEASE");
    if (!["claimed", "running"].includes(attempt.status)) throw new Error("INVALID_STATE");
    await repo.updateAttemptStatus(attemptId, "completed");
    await repo.updateTaskStatus(attempt.taskRunId, "completed");
    const taskRun = await repo.findTaskRun(attempt.taskRunId);
    if (taskRun) config.onTaskCompleted(taskRun);
  }

  async function handleFail(attemptId: string, leaseToken: string, failureType: FailureType, failureReason: string): Promise<void> {
    const attempt = await repo.findAttempt(attemptId);
    if (!attempt || attempt.leaseToken !== leaseToken) throw new Error("INVALID_LEASE");
    if (!["claimed", "running"].includes(attempt.status)) throw new Error("INVALID_STATE");
    await repo.updateAttemptStatus(attemptId, "failed", { failureType, failureReason });

    const taskRun = await repo.findTaskRun(attempt.taskRunId);
    if (!taskRun) return;

    const shouldRetry = failureType !== "business_error"
      && failureType !== "cancelled"
      && taskRun.currentAttemptCount < taskRun.maxAttempts;

    if (shouldRetry) {
      await repo.updateTaskStatus(taskRun.id, "ready");
    } else {
      await repo.updateTaskStatus(taskRun.id, "permanently_failed");
      config.onTaskFailed(taskRun);
    }
  }

  async function scanExpiredLeases(): Promise<void> {
    const expired = await repo.findExpiredAttempts();
    for (const attempt of expired) {
      await repo.updateAttemptStatus(attempt.id, "expired");
      const taskRun = await repo.findTaskRun(attempt.taskRunId);
      if (!taskRun) continue;
      const shouldRetry = taskRun.currentAttemptCount < taskRun.maxAttempts;
      if (shouldRetry) {
        await repo.updateTaskStatus(taskRun.id, "ready");
      } else {
        await repo.updateTaskStatus(taskRun.id, "permanently_failed");
        config.onTaskFailed(taskRun);
      }
    }
  }

  return {
    submitTask,
    cancelTask,
    getTaskStatus: (id) => repo.findTaskRun(id),
    listTasksByWorkflow: (id) => repo.listTasksByWorkflow(id),
    handleClaim,
    handleHeartbeat,
    handleComplete,
    handleFail,
    async start() {
      scanTimer = setInterval(() => void scanExpiredLeases(), leaseScanIntervalMs);
    },
    async stop() {
      if (scanTimer) clearInterval(scanTimer);
      await sql.end();
    },
  };
}

export { createSql, SchedulerRepository } from "./repository.js";
