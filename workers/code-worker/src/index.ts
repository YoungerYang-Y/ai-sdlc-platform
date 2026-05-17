import { createWorker, type TaskContext, type TaskResult } from "@ai-sdlc/worker-sdk";
import { CliRuntime } from "@ai-sdlc/runtime";
import { FileSystemArtifactStore } from "@ai-sdlc/artifact";
import { WorkspaceManager } from "./workspace.js";
import { resolveCliCommand, resetCliCache } from "./cli-resolver.js";
import { DeliveryManager } from "./delivery.js";
import { spawn } from "node:child_process";

const implementation = (process.argv.find(a => a.startsWith("--implementation="))?.split("=")[1] ?? "kiro") as any;
const mock = process.argv.includes("--mock");

const runtime = new CliRuntime();
const artifactStore = new FileSystemArtifactStore({ basePath: process.env.ARTIFACT_PATH ?? "./artifacts" });
const workspace = new WorkspaceManager();
const delivery = new DeliveryManager();

async function handler(ctx: TaskContext): Promise<TaskResult> {
  const { taskRun, evidence, abortSignal, logger } = ctx;
  const params = taskRun.params as Record<string, unknown> | null;
  const requirement = (params?.requirement as string) ?? "";
  const stepId = (params?.stepId as string) ?? taskRun.taskType;
  const repository = params?.repository as string | undefined;
  const branch = params?.branch as string | undefined;
  const workDir = params?.workDir as string | undefined;
  const verifyCommand = params?.verifyCommand as string | undefined;

  logger.info("executing", { taskType: taskRun.taskType, stepId, mock });

  if (mock) {
    return handleMock(ctx, stepId, requirement);
  }

  if (stepId === "verify") {
    return handleVerify(ctx, verifyCommand);
  }

  return handleCode(ctx, requirement, repository, branch, workDir);
}

async function handleMock(ctx: TaskContext, stepId: string, requirement: string): Promise<TaskResult> {
  const { taskRun, evidence } = ctx;
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

async function handleCode(ctx: TaskContext, requirement: string, repository?: string, branch?: string, workDir?: string): Promise<TaskResult> {
  const { taskRun, evidence, abortSignal, logger } = ctx;

  // Acquire workspace (reset if retrying)
  if (taskRun.currentAttemptCount > 1) {
    await workspace.reset(taskRun.workflowRunId);
  }
  const ws = await workspace.acquire({ workflowRunId: taskRun.workflowRunId, repository, branch, workDir });

  evidence.append("context_loaded", { requirement, repository, branch, commit: ws.baseCommit });

  // Resolve CLI
  const cli = await resolveCliCommand(implementation);
  logger.info("cli resolved", { name: cli.name });

  // Execute CLI
  const session = await runtime.createSession({
    runtimeType: "cli",
    workDir: ws.path,
    timeout: taskRun.timeoutMs,
    abortSignal,
  });

  try {
    const cmd = [...cli.command, requirement];
    const result = await session.execute({ command: cmd });
    evidence.append("tool_called", { toolName: cli.name, status: result.status, durationMs: result.durationMs });

    if (result.status !== "success") {
      return { status: "failed", failureType: "business_error", failureReason: result.stderr || `exit ${result.exitCode}` };
    }

    // Extract git diff
    const patch = await gitDiff(ws.path);
    if (!patch) {
      return { status: "failed", failureType: "business_error", failureReason: "no changes generated" };
    }

    const ref = await artifactStore.write({
      content: patch,
      metadata: {
        artifactType: "patch",
        workflowRunId: taskRun.workflowRunId,
        taskRunId: taskRun.id,
        filename: "patch.diff",
        mimeType: "text/x-diff",
        sizeBytes: Buffer.byteLength(patch),
      },
    });

    evidence.append("artifact_written", { ref });
    return { status: "completed", artifactRefs: [ref], finalConclusion: "code changes generated" };
  } finally {
    await session.destroy();
  }
}

async function handleVerify(ctx: TaskContext, verifyCommand?: string): Promise<TaskResult> {
  const { taskRun, evidence, abortSignal, logger } = ctx;

  if (!verifyCommand) {
    logger.info("no verifyCommand, skipping");
    return { status: "completed", finalConclusion: "verify skipped (no command)" };
  }

  const ws = await workspace.acquire({ workflowRunId: taskRun.workflowRunId });
  evidence.append("context_loaded", { verifyCommand, workDir: ws.path });

  const session = await runtime.createSession({
    runtimeType: "cli",
    workDir: ws.path,
    timeout: taskRun.timeoutMs,
    abortSignal,
  });

  try {
    const result = await session.execute({ command: ["sh", "-c", verifyCommand] });
    evidence.append("tool_called", { toolName: "verify", status: result.status, durationMs: result.durationMs });

    const log = `$ ${verifyCommand}\n${result.stdout}\n${result.stderr}`;
    const ref = await artifactStore.write({
      content: log,
      metadata: {
        artifactType: "log",
        workflowRunId: taskRun.workflowRunId,
        taskRunId: taskRun.id,
        filename: "verify.log",
        mimeType: "text/plain",
        sizeBytes: Buffer.byteLength(log),
      },
    });
    evidence.append("artifact_written", { ref });

    if (result.status !== "success") {
      return { status: "failed", failureType: "business_error", failureReason: `verify failed (exit ${result.exitCode})`, artifactRefs: [ref] };
    }

    return { status: "completed", artifactRefs: [ref], finalConclusion: "verification passed" };
  } finally {
    await session.destroy();
  }
}

async function gitDiff(cwd: string): Promise<string> {
  const tracked = await execOutput("git", ["diff", "HEAD"], cwd);
  const untracked = await execOutput("git", ["ls-files", "--others", "--exclude-standard"], cwd);

  let patch = tracked;
  if (untracked.trim()) {
    const files = untracked.trim().split("\n");
    // Stage untracked files to include in diff, then clean up
    await execVoid("git", ["add", "-N", ...files], cwd);
    patch = await execOutput("git", ["diff", "HEAD"], cwd);
    await execVoid("git", ["reset", "HEAD", "--", ...files], cwd);
  }
  return patch;
}

function execOutput(cmd: string, args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    proc.stdout.on("data", (d) => { stdout += d; });
    proc.on("close", (code) => code === 0 ? resolve(stdout) : resolve(""));
    proc.on("error", () => resolve(""));
  });
}

function execVoid(cmd: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { cwd, stdio: "ignore" });
    proc.on("close", () => resolve());
    proc.on("error", () => resolve());
  });
}

// --- Worker startup ---
async function main() {
  await workspace.cleanOrphans();
  await delivery.checkGhAvailability();

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
}

// Export handler for testing
export { handler, workspace, delivery, artifactStore };

// Only run main when executed directly (not when imported for testing)
const isMain = process.argv[1]?.includes("code-worker");
if (isMain) {
  main().catch(console.error);
}
