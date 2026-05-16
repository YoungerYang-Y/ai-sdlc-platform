import { createWorker, type TaskContext, type TaskResult } from "@ai-sdlc/worker-sdk";
import { CliRuntime } from "@ai-sdlc/runtime";
import { FileSystemArtifactStore } from "@ai-sdlc/artifact";

const implementation = (process.argv.find(a => a.startsWith("--implementation="))?.split("=")[1] ?? "claude-code") as any;
const mock = process.argv.includes("--mock");

const runtime = new CliRuntime();
const artifactStore = new FileSystemArtifactStore({ basePath: process.env.ARTIFACT_PATH ?? "./artifacts" });

async function handler(ctx: TaskContext): Promise<TaskResult> {
  const { taskRun, evidence, abortSignal, logger } = ctx;
  const params = taskRun.params as Record<string, unknown> | null;
  const requirement = (params?.requirement as string) ?? "";

  evidence.append("context_loaded", { requirement, implementation });
  logger.info("reviewing", { taskRunId: taskRun.id });

  if (mock) {
    const report = `## Review Report\n\n**Requirement**: ${requirement}\n**Verdict**: APPROVED\n\nCode meets requirements.`;
    const ref = await artifactStore.write({
      content: report,
      metadata: {
        artifactType: "review_report",
        workflowRunId: taskRun.workflowRunId,
        taskRunId: taskRun.id,
        filename: "review.md",
        mimeType: "text/markdown",
        sizeBytes: Buffer.byteLength(report),
      },
    });

    evidence.append("tool_called", { toolName: `${implementation}(mock)`, status: "success", durationMs: 50 });
    evidence.append("artifact_written", { ref });
    return { status: "completed", artifactRefs: [ref], finalConclusion: "APPROVED (mock)" };
  }

  // Real mode
  const session = await runtime.createSession({ runtimeType: "cli", workDir: process.cwd(), timeout: taskRun.timeoutMs, abortSignal });
  try {
    const result = await session.execute({ command: ["claude", "-p", `Review this code change for: ${requirement}`] });
    evidence.append("tool_called", { toolName: implementation, status: result.status, durationMs: result.durationMs });

    if (result.status !== "success") {
      return { status: "failed", failureType: "business_error", failureReason: result.stderr || `exit ${result.exitCode}` };
    }

    const ref = await artifactStore.write({
      content: result.stdout,
      metadata: { artifactType: "review_report", workflowRunId: taskRun.workflowRunId, taskRunId: taskRun.id, filename: "review.md", mimeType: "text/markdown", sizeBytes: Buffer.byteLength(result.stdout) },
    });

    evidence.append("artifact_written", { ref });
    return { status: "completed", artifactRefs: [ref], finalConclusion: result.stdout.includes("APPROVED") ? "APPROVED" : "CHANGES_REQUESTED" };
  } finally {
    await session.destroy();
  }
}

const worker = createWorker(
  {
    workerId: process.env.WORKER_ID ?? `review-worker-${process.pid}`,
    roles: ["review"],
    implementation,
    supportedTaskTypes: ["review"],
    versionSetId: process.env.VERSION_SET_ID ?? "00000000-0000-0000-0000-000000000001",
    scheduler: { baseUrl: process.env.SCHEDULER_URL ?? "http://localhost:8000", pollIntervalMs: 3000 },
    observability: { baseUrl: process.env.OBSERVABILITY_URL ?? "http://localhost:8002" },
  },
  handler,
);

worker.start();
process.on("SIGTERM", () => void worker.stop());
process.on("SIGINT", () => void worker.stop());
