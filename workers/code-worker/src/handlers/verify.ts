import type { TaskContext, TaskResult } from "@ai-sdlc/worker-sdk";
import type { CliRuntime } from "@ai-sdlc/runtime";
import type { FileSystemArtifactStore } from "@ai-sdlc/artifact";
import type { WorkspaceManager } from "../workspace.js";

export async function handleVerify(ctx: TaskContext, verifyCommand: string | undefined, runtime: CliRuntime, artifactStore: FileSystemArtifactStore, workspace: WorkspaceManager): Promise<TaskResult> {
  const { taskRun, evidence, abortSignal, logger } = ctx;

  if (!verifyCommand) {
    logger.info("no verifyCommand, skipping");
    return { status: "completed", finalConclusion: "verify skipped (no command)" };
  }

  const ws = await workspace.acquire({ workflowRunId: taskRun.workflowRunId });
  evidence.append("context_loaded", { verifyCommand, workDir: ws.path });

  const session = await runtime.createSession({ runtimeType: "cli", workDir: ws.path, timeout: taskRun.timeoutMs, abortSignal });
  try {
    const result = await session.execute({ command: ["sh", "-c", verifyCommand] });
    evidence.append("tool_called", { toolName: "verify", status: result.status, durationMs: result.durationMs });

    const log = `$ ${verifyCommand}\n${result.stdout}\n${result.stderr}`;
    const ref = await artifactStore.write({
      content: log,
      metadata: { artifactType: "log", workflowRunId: taskRun.workflowRunId, taskRunId: taskRun.id, filename: "verify.log", mimeType: "text/plain", sizeBytes: Buffer.byteLength(log) },
    });
    evidence.append("artifact_written", { ref });

    if (result.status !== "success") return { status: "failed", failureType: "business_error", failureReason: `verify failed (exit ${result.exitCode})`, artifactRefs: [ref] };
    return { status: "completed", artifactRefs: [ref], finalConclusion: "verification passed" };
  } finally {
    await session.destroy();
  }
}
