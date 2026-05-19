import type { TaskContext, TaskResult } from "@ai-sdlc/worker-sdk";
import type { CliRuntime } from "@ai-sdlc/runtime";
import type { FileSystemArtifactStore } from "@ai-sdlc/artifact";
import type { WorkspaceManager } from "../workspace.js";
import { resolveCliCommand } from "../cli-resolver.js";
import { gitDiff, execVoid } from "../git-utils.js";

export async function handleCode(ctx: TaskContext, requirement: string, repository: string | undefined, branch: string | undefined, workDir: string | undefined, impl: string, runtime: CliRuntime, artifactStore: FileSystemArtifactStore, workspace: WorkspaceManager): Promise<TaskResult> {
  const { taskRun, evidence, abortSignal, logger } = ctx;

  const ws = await workspace.acquire({ workflowRunId: taskRun.workflowRunId, repository, branch, workDir });
  await workspace.reset(taskRun.workflowRunId);
  evidence.append("context_loaded", { requirement, repository, branch, commit: ws.baseCommit });

  const cli = await resolveCliCommand(impl);
  logger.info("cli resolved", { name: cli.name });

  const session = await runtime.createSession({
    runtimeType: "cli", workDir: ws.path, timeout: taskRun.timeoutMs, abortSignal,
    env: { NO_COLOR: "1", KIRO_LOG_NO_COLOR: "1", FORCE_COLOR: "0" },
  });

  try {
    const result = await session.execute({ command: [...cli.command, requirement] });
    evidence.append("tool_called", { toolName: cli.name, status: result.status, durationMs: result.durationMs });

    if (result.status !== "success") return { status: "failed", failureType: "business_error", failureReason: result.stderr || `exit ${result.exitCode}` };

    const patch = await gitDiff(ws.path);
    if (!patch) return { status: "failed", failureType: "business_error", failureReason: "no changes generated" };

    await execVoid("git", ["add", "-A"], ws.path);
    await execVoid("git", ["commit", "-m", `ai-sdlc(code): ${requirement.slice(0, 50)}\n\nWorkflow: ${taskRun.workflowRunId}`], ws.path);

    const ref = await artifactStore.write({
      content: patch,
      metadata: { artifactType: "patch", workflowRunId: taskRun.workflowRunId, taskRunId: taskRun.id, filename: "patch.diff", mimeType: "text/x-diff", sizeBytes: Buffer.byteLength(patch) },
    });
    evidence.append("artifact_written", { ref });
    return { status: "completed", artifactRefs: [ref], finalConclusion: "code changes generated" };
  } finally {
    await session.destroy();
  }
}
