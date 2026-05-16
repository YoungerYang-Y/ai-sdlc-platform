import { createOrchestrator } from "./index.js";

const orchestrator = createOrchestrator({
  port: Number(process.env.PORT ?? 8000),
  connectionString: process.env.DATABASE_URL ?? "postgresql://dev:dev@localhost:5432/ai_sdlc",
});

orchestrator.start();

process.on("SIGTERM", () => void orchestrator.stop());
process.on("SIGINT", () => void orchestrator.stop());
