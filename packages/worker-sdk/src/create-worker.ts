import type { TaskType } from "./types/execution.js";
import type { AttemptSummaryReport } from "./types/observability.js";
import type { WorkerImplementation, WorkerRole } from "./types/identity.js";
import type { Logger } from "./types/interfaces.js";
import { SchedulerClient } from "./client/scheduler-client.js";
import { ObservabilityClient } from "./client/observability-client.js";
import { LeaseManager } from "./framework/lease-manager.js";
import { EvidenceCollector } from "./framework/evidence-collector.js";
import { createConsoleLogger } from "./types/interfaces.js";
import type { TaskContext, TaskResult, Worker, WorkerConfig } from "./types/worker.js";

export function createWorker(config: WorkerConfig, handler: (ctx: TaskContext) => Promise<TaskResult>): Worker {
  const logger = config.logger ?? createConsoleLogger(config.workerId);
  const scheduler = new SchedulerClient({ baseUrl: config.scheduler.baseUrl, logger });
  const obsClient = new ObservabilityClient({ baseUrl: config.observability.baseUrl, logger });

  let running = false;
  let abortController: AbortController | null = null;

  async function loop(): Promise<void> {
    while (running) {
      const claim = await scheduler.claim({
        workerId: config.workerId,
        supportedTaskTypes: config.supportedTaskTypes,
        implementation: config.implementation,
        versionSetId: config.versionSetId,
      }).catch((err) => {
        logger.error("claim error", { error: String(err) });
        return null;
      });

      if (!claim) {
        await sleep(config.scheduler.pollIntervalMs ?? 5000);
        continue;
      }

      await executeAttempt(claim, handler, scheduler, obsClient, logger, config);
    }
  }

  return {
    async start() {
      running = true;
      logger.info("worker started", { workerId: config.workerId, roles: config.roles });
      await loop();
    },
    async stop() {
      running = false;
      if (abortController) abortController.abort();
      logger.info("worker stopped");
    },
  };

  async function executeAttempt(
    claim: NonNullable<Awaited<ReturnType<SchedulerClient["claim"]>>>,
    handler: (ctx: TaskContext) => Promise<TaskResult>,
    scheduler: SchedulerClient,
    obsClient: ObservabilityClient,
    logger: Logger,
    config: WorkerConfig,
  ): Promise<void> {
    abortController = new AbortController();
    const { taskRun, attempt, leaseToken, leaseDurationMs } = claim;

    const leaseManager = new LeaseManager({
      attemptId: attempt.id,
      leaseToken,
      leaseDurationMs,
      heartbeatFactor: 3,
      maxFailures: 2,
      scheduler,
      logger,
      onExpired: () => abortController?.abort(),
    });

    const evidence = new EvidenceCollector({
      attemptId: attempt.id,
      reporter: obsClient,
      flushBatchSize: config.observability.flushBatchSize ?? 10,
      flushIntervalMs: config.observability.flushIntervalMs ?? 5000,
      maxBufferSize: 100,
    });

    leaseManager.start();
    const startedAt = new Date().toISOString();

    let result: TaskResult;
    try {
      result = await handler({
        taskRun,
        attempt,
        evidence,
        abortSignal: abortController.signal,
        logger,
      });
    } catch (err) {
      result = {
        status: "failed",
        failureType: "infrastructure_error",
        failureReason: err instanceof Error ? err.message : String(err),
      };
    }

    leaseManager.stop();
    evidence.stop();

    // 上报 complete/fail
    if (result.status === "completed") {
      await scheduler.complete({ attemptId: attempt.id, leaseToken, artifactRefs: result.artifactRefs ?? [] });
    } else {
      await scheduler.fail({
        attemptId: attempt.id,
        leaseToken,
        failureType: (result.failureType ?? "business_error") as import("./types/execution.js").FailureType,
        failureReason: result.failureReason ?? "unknown",
      });
    }

    // flush 残余证据 + 发送 summary
    await evidence.flush();
    const finishedAt = new Date().toISOString();
    const summary: AttemptSummaryReport = {
      attemptId: attempt.id,
      taskRunId: taskRun.id,
      workerId: config.workerId,
      versionSetId: config.versionSetId,
      finalStatus: result.status === "completed" ? "completed" : "failed",
      startedAt,
      finishedAt,
      durationMs: Date.parse(finishedAt) - Date.parse(startedAt),
      tokenTotals: { input: 0, output: 0, total: 0 },
      costTotals: { totalUsd: 0 },
      toolStats: { totalCalls: 0, successCount: 0, failedCount: 0 },
      artifactRefs: result.artifactRefs ?? [],
      failureType: result.failureType,
      failureReason: result.failureReason,
      checkpointDigest: "",
      finalConclusion: result.finalConclusion ?? "",
    };
    await obsClient.sendSummary(summary);
    abortController = null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
