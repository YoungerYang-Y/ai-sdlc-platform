/**
 * Process entry point — composition root that wires orchestrator, workers, and infrastructure.
 * This file lives at the project root level and can import from any package.
 * Run with: npx tsx src/server.ts (or from Docker)
 */
import { createOrchestrator } from "../apps/orchestrator/src/index.js";
import { createObservability } from "../packages/observability/src/index.js";
import { createEvaluation } from "../packages/evaluation/src/index.js";
import { WorkspaceManager } from "../workers/code-worker/src/workspace.js";
import { DeliveryManager } from "../workers/code-worker/src/delivery.js";
import { FileSystemArtifactStore } from "../packages/artifact/src/index.js";

const connectionString = process.env.DATABASE_URL ?? "postgresql://dev:dev@localhost:5432/ai_sdlc";

// Infrastructure
const observability = createObservability({ port: Number(process.env.OBS_PORT ?? 8002), connectionString });
const evaluation = createEvaluation({ connectionString });
const workspace = new WorkspaceManager();
const delivery = new DeliveryManager();
const artifactStore = new FileSystemArtifactStore({ basePath: process.env.ARTIFACT_PATH ?? "./artifacts" });

await workspace.cleanOrphans();
await delivery.checkGhAvailability();

// Orchestrator with lifecycle hooks
const orchestrator = createOrchestrator({
  port: Number(process.env.PORT ?? 8000),
  connectionString,
  onAttemptFinished: (attemptId) => {
    void observability.notifyFinished(attemptId).catch((err) => console.error("notifyFinished failed", err));
  },
  onWorkflowCompleted: (run) => {
    const mode = run.input.repository ? "cloned" : "local";
    // PR delivery (best-effort)
    if (delivery.shouldDeliver(run.triggerType, mode as "local" | "cloned")) {
      void (async () => {
        try {
          const { path } = await workspace.acquire({ workflowRunId: run.id, workDir: run.input.workDir as string | undefined, repository: run.input.repository as string | undefined });
          const refs = await artifactStore.list({ workflowRunId: run.id, artifactType: "review_report" });
          let reviewReport = "";
          if (refs.length > 0) {
            const art = await artifactStore.read(refs[0]!);
            reviewReport = art.data.toString("utf-8");
          }
          const result = await delivery.deliver({ workDir: path, requirement: (run.input.requirement as string) ?? "", workflowRunId: run.id, reviewReport });
          if (result.prUrl) console.log(`PR created: ${result.prUrl}`);
          if (result.error) console.warn(`PR creation failed (best-effort): ${result.error}`);
        } catch (err) { console.error("delivery failed", err); }
      })();
    }
    // Workspace cleanup
    void workspace.release(run.id);
  },
  onWorkflowFailed: (run) => {
    void workspace.release(run.id);
  },
});

await orchestrator.start();
await observability.start();
evaluation.start();

console.log("AI SDLC Platform running");

const shutdown = async () => {
  console.log("\nShutting down...");
  setTimeout(() => process.exit(0), 3000); // force exit after 3s
  try { await evaluation.stop(); } catch {}
  try { await observability.stop(); } catch {}
  try { await orchestrator.stop(); } catch {}
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
