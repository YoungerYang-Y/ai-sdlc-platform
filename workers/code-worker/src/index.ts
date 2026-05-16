import { createWorker, type TaskContext, type TaskResult } from "@ai-sdlc/worker-sdk";
import { CliRuntime } from "@ai-sdlc/runtime";
import { FileSystemArtifactStore } from "@ai-sdlc/artifact";
import { join } from "node:path";

const implementation = (process.argv.find(a => a.startsWith("--implementation="))?.split("=")[1] ?? "codex") as any;
const mock = process.argv.includes("--mock");

const runtime = new CliRuntime();
const artifactStore = new FileSystemArtifactStore({ basePath: process.env.ARTIFACT_PATH ?? "./artifacts" });

async function handler(ctx: TaskContext): Promise<TaskResult> {
  const { taskRun, evidence, abortSignal, logger } = ctx;
  const params = taskRun.params as Record<string, unknown> | null;
  const requirement = (params?.requirement as string) ?? "";
  const stepId = (params?.stepId as string) ?? taskRun.taskType;

  evidence.append("context_loaded", { requirement, stepId, implementation });
  logger.info("executing", { taskType: taskRun.taskType, stepId });

  if (mock) {
    // Mock mode: simulate CLI execution
    const output = stepId === "verify"
      ? "All tests passed."
      : `// Generated code for: ${requirement}\nexport function main() { return true; }`;

    const ref = await artifactStore.write({
      content: output,
      metadata: {
        artifactType: stepId === "verify" ? "log" : "patch",
        workflowRunId: taskRun.workflowRunId,
        taskRunId: taskRun.id,
        filename: stepId === "verify" ? "verify.log" : "patch.diff",
        mimeType: "text/plain",
        sizeBytes: Buffer.byteLength(output),
      },
    });

    evidence.append("tool_called", { toolName: `${implementation}(mock)`, status: "success", durationMs: 100 });
    evidence.append("artifact_written", { ref });
    return { status: "completed", artifactRefs: [ref], finalConclusion: `${stepId} completed (mock)` };
  }

  // Real mode: call CLI
  const session = await runtime.createSession({
    runtimeType: "cli",
    workDir: process.cwd(),
    timeout: taskRun.timeoutMs,
    abortSignal,
  });

  try {
    const cmd = implementation === "codex"
      ? ["codex", "--quiet", "--task", requirement]
      : ["claude", "-p", requirement];

    const result = await session.execute({ command: cmd });
    evidence.append("tool_called", { toolName: implementation, status: result.status, durationMs: result.durationMs });

    if (result.status !== "success") {
      return { status: "failed", failureType: "business_error", failureReason: result.stderr || `exit ${result.exitCode}` };
    }

    const ref = await artifactStore.write({
      content: result.stdout,
      metadata: {
        artifactType: stepId === "verify" ? "log" : "patch",
        workflowRunId: taskRun.workflowRunId,
        taskRunId: taskRun.id,
        filename: stepId === "verify" ? "verify.log" : "patch.diff",
        mimeType: "text/plain",
        sizeBytes: Buffer.byteLength(result.stdout),
      },
    });

    evidence.append("artifact_written", { ref });
    return { status: "completed", artifactRefs: [ref] };
  } finally {
    await session.destroy();
  }
}

const worker = createWorker(
  {
    workerId: process.env.WORKER_ID ?? `code-worker-${process.pid}`,
    roles: ["code"],
    implementation,
    supportedTaskTypes: ["code", "verify"],
    versionSetId: process.env.VERSION_SET_ID ?? "00000000-0000-0000-0000-000000000001",
    scheduler: { baseUrl: process.env.SCHEDULER_URL ?? "http://localhost:8000", pollIntervalMs: 3000 },
    observability: { baseUrl: process.env.OBSERVABILITY_URL ?? "http://localhost:8002" },
  },
  handler,
);

worker.start();
process.on("SIGTERM", () => void worker.stop());
process.on("SIGINT", () => void worker.stop());
