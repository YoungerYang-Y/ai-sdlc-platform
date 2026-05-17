import { createWorker, type TaskContext, type TaskResult } from "@ai-sdlc/worker-sdk";
import { CliRuntime } from "@ai-sdlc/runtime";
import { FileSystemArtifactStore } from "@ai-sdlc/artifact";
import { resolveCliCommand } from "./cli-resolver.js";

const implementation = (process.argv.find(a => a.startsWith("--implementation="))?.split("=")[1] ?? "kiro") as any;
const mock = process.argv.includes("--mock");

const runtime = new CliRuntime();
const artifactStore = new FileSystemArtifactStore({ basePath: process.env.ARTIFACT_PATH ?? "./artifacts" });

export async function handler(ctx: TaskContext): Promise<TaskResult> {
  const { taskRun, evidence, logger } = ctx;
  const params = taskRun.params as Record<string, unknown> | null;
  const requirement = (params?.requirement as string) ?? "";

  logger.info("reviewing", { taskRunId: taskRun.id, mock });

  if (mock) {
    return handleMock(ctx, requirement);
  }

  return handleReview(ctx, requirement);
}

async function handleMock(ctx: TaskContext, requirement: string): Promise<TaskResult> {
  const { taskRun, evidence } = ctx;
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

async function handleReview(ctx: TaskContext, requirement: string): Promise<TaskResult> {
  const { taskRun, evidence, abortSignal, logger } = ctx;
  const params = taskRun.params as Record<string, unknown> | null;
  const workDir = (params?.workDir as string) ?? process.cwd();

  // Load patch from previous code step
  const patchRefs = await artifactStore.list({ workflowRunId: taskRun.workflowRunId, artifactType: "patch" });
  let patchContent = "";
  if (patchRefs.length > 0) {
    const artifact = await artifactStore.read(patchRefs[0]!);
    patchContent = artifact.data.toString("utf-8");
  }

  evidence.append("context_loaded", { requirement, patchLoaded: patchRefs.length > 0, patchSize: patchContent.length });

  const prompt = patchContent
    ? `Review this code change for the requirement: "${requirement}"\n\n\`\`\`diff\n${patchContent}\n\`\`\``
    : `Review code changes for: ${requirement}`;

  // Resolve CLI
  const cli = await resolveCliCommand(implementation);
  logger.info("cli resolved", { name: cli.name });

  const cmd = [...cli.command, prompt];

  const session = await runtime.createSession({
    runtimeType: "cli",
    workDir,
    timeout: taskRun.timeoutMs,
    abortSignal,
    env: { NO_COLOR: "1" },
  });
  try {
    const result = await session.execute({ command: cmd });
    evidence.append("tool_called", { toolName: cli.name, status: result.status, durationMs: result.durationMs });

    if (result.status !== "success") {
      return { status: "failed", failureType: "business_error", failureReason: result.stderr || `exit ${result.exitCode}` };
    }

    const report = result.stdout || "Review completed - no output from CLI";
    const ref = await artifactStore.write({
      content: report,
      metadata: { artifactType: "review_report", workflowRunId: taskRun.workflowRunId, taskRunId: taskRun.id, filename: "review.md", mimeType: "text/markdown", sizeBytes: Buffer.byteLength(report) },
    });

    evidence.append("artifact_written", { ref });
    const conclusion = report.includes("APPROVED") || report.includes("approved") ? "APPROVED" : "CHANGES_REQUESTED";
    return { status: "completed", artifactRefs: [ref], finalConclusion: conclusion };
  } finally {
    await session.destroy();
  }
}

// --- Entrypoint (only runs when executed directly) ---
async function main() {
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
}

const isMain = process.argv[1]?.includes("review-worker");
if (isMain) {
  main().catch(console.error);
}
