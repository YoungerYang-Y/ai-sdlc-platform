import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { createScheduler, createSql, type Scheduler } from "@ai-sdlc/scheduler";
import { createWorkflowEngine } from "./engine.js";
import { createBenchmarkRoutes } from "./routes/benchmark.js";
import { createExperimentRoutes } from "./routes/experiment.js";
import { createWorkflowRoutes } from "./routes/workflow.js";
import { createScorecardRoutes } from "./routes/scorecard.js";
import { createArtifactRoutes } from "./routes/artifacts.js";
import { createSchedulerApiRoutes } from "./routes/scheduler-api.js";
import type { OrchestratorConfig } from "./types.js";

export type { WorkflowRun, OrchestratorConfig } from "./types.js";

// --- Orchestrator ---

export function createOrchestrator(config: OrchestratorConfig) {
  const sql = createSql(config.connectionString);
  let scheduler: Scheduler;
  const getScheduler = () => scheduler;

  const engine = createWorkflowEngine(sql, getScheduler, config);

  const app = new Hono();
  app.route("/", createBenchmarkRoutes(sql));
  app.route("/", createExperimentRoutes(sql, engine.createWorkflowRun));
  app.route("/", createWorkflowRoutes(sql, engine, config));
  app.route("/", createScorecardRoutes(sql));
  app.route("/", createArtifactRoutes());
  app.route("/", createSchedulerApiRoutes(getScheduler));

  return {
    async start() {
      scheduler = createScheduler({
        connectionString: config.connectionString,
        ...config.schedulerConfig,
        onTaskCompleted: (t) => void engine.handleTaskCompleted(t).catch((err) => console.error("handleTaskCompleted failed", err)),
        onTaskFailed: (t) => void engine.handleTaskFailed(t).catch((err) => console.error("handleTaskFailed failed", err)),
        onAttemptFinished: config.onAttemptFinished,
      });
      await scheduler.start();
      serve({ fetch: app.fetch, port: config.port });
      console.log(`Orchestrator running on :${config.port}`);
    },
    async stop() {
      await scheduler.stop();
      await sql.end();
    },
    app,
  };
}
