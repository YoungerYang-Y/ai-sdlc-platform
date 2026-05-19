import { createWorker, type TaskContext, type TaskResult } from "@ai-sdlc/worker-sdk";
import { CliRuntime } from "@ai-sdlc/runtime";
import { FileSystemArtifactStore } from "@ai-sdlc/artifact";
import { WorkspaceManager } from "./workspace.js";
import { DeliveryManager } from "./delivery.js";
import { handleMock } from "./handlers/mock.js";
import { handleCode } from "./handlers/code.js";
import { handleVerify } from "./handlers/verify.js";

const implementation = (process.argv.find(a => a.startsWith("--implementation="))?.split("=")[1] ?? "kiro") as any;
const mock = process.argv.includes("--mock");

const runtime = new CliRuntime();
const artifactStore = new FileSystemArtifactStore({ basePath: process.env.ARTIFACT_PATH ?? "./artifacts" });
const workspace = new WorkspaceManager();
const delivery = new DeliveryManager();

async function handler(ctx: TaskContext): Promise<TaskResult> {
  const params = ctx.taskRun.params as Record<string, unknown> | null;
  const requirement = (params?.requirement as string) ?? "";
  const stepId = (params?.stepId as string) ?? ctx.taskRun.taskType;
  const taskImpl = (params?.implementation as string) ?? implementation;

  ctx.logger.info("executing", { taskType: ctx.taskRun.taskType, stepId, mock });

  if (mock) return handleMock(ctx, stepId, requirement, artifactStore, implementation);
  if (stepId === "verify") return handleVerify(ctx, params?.verifyCommand as string | undefined, runtime, artifactStore, workspace);
  return handleCode(ctx, requirement, params?.repository as string | undefined, params?.branch as string | undefined, params?.workDir as string | undefined, taskImpl, runtime, artifactStore, workspace);
}

async function main() {
  await workspace.cleanOrphans();
  await delivery.checkGhAvailability();

  const worker = createWorker({
    workerId: process.env.WORKER_ID ?? `code-worker-${process.pid}`,
    roles: ["code"],
    implementation,
    supportedTaskTypes: ["code", "verify"],
    versionSetId: process.env.VERSION_SET_ID ?? "00000000-0000-0000-0000-000000000001",
    scheduler: { baseUrl: process.env.SCHEDULER_URL ?? "http://localhost:8000", pollIntervalMs: 3000 },
    observability: { baseUrl: process.env.OBSERVABILITY_URL ?? "http://localhost:8002" },
  }, handler);

  worker.start();
  process.on("SIGTERM", () => void worker.stop());
  process.on("SIGINT", () => void worker.stop());
}

export { handler, workspace, delivery, artifactStore };

import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
const isMain = fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? "");
if (isMain) main().catch(console.error);
