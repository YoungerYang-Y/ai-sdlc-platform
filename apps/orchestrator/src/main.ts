import { createOrchestrator } from "./index.js";
import { createObservability } from "@ai-sdlc/observability";

const connectionString = process.env.DATABASE_URL ?? "postgresql://dev:dev@localhost:5432/ai_sdlc";

const orchestrator = createOrchestrator({
  port: Number(process.env.PORT ?? 8000),
  connectionString,
});

const observability = createObservability({
  port: Number(process.env.OBS_PORT ?? 8002),
  connectionString,
});

await orchestrator.start();
await observability.start();

process.on("SIGTERM", async () => { await observability.stop(); await orchestrator.stop(); });
process.on("SIGINT", async () => { await observability.stop(); await orchestrator.stop(); });
