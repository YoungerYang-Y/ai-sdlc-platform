import { createOrchestrator } from "./index.js";
import { createObservability } from "@ai-sdlc/observability";
import { createEvaluation } from "@ai-sdlc/evaluation";

const connectionString = process.env.DATABASE_URL ?? "postgresql://dev:dev@localhost:5432/ai_sdlc";

const observability = createObservability({
  port: Number(process.env.OBS_PORT ?? 8002),
  connectionString,
});

const evaluation = createEvaluation({ connectionString });

const orchestrator = createOrchestrator({
  port: Number(process.env.PORT ?? 8000),
  connectionString,
  onAttemptFinished: (attemptId) => void observability.notifyFinished(attemptId).catch((err) => console.error("notifyFinished failed", err)),
});

await orchestrator.start();
await observability.start();
evaluation.start();

process.on("SIGTERM", async () => { await evaluation.stop(); await observability.stop(); await orchestrator.stop(); });
process.on("SIGINT", async () => { await evaluation.stop(); await observability.stop(); await orchestrator.stop(); });
