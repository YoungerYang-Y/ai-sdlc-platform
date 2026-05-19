import { Hono } from "hono";
import type { Scheduler } from "@ai-sdlc/scheduler";

export function createSchedulerApiRoutes(getScheduler: () => Scheduler) {
  const app = new Hono();

  app.get("/workflows/:id/tasks", async (c) => {
    const tasks = await getScheduler().listTasksByWorkflow(c.req.param("id"));
    return c.json(tasks);
  });

  app.post("/tasks/claim", async (c) => {
    const body = await c.req.json();
    const result = await getScheduler().handleClaim(body);
    if (!result) return c.body(null, 204);
    return c.json(result);
  });

  app.post("/attempts/:id/heartbeat", async (c) => {
    const { leaseToken } = await c.req.json();
    try {
      const result = await getScheduler().handleHeartbeat(c.req.param("id"), leaseToken);
      return c.json(result);
    } catch {
      return c.json({ error: "lease expired" }, 409);
    }
  });

  app.post("/attempts/:id/complete", async (c) => {
    const { leaseToken, artifactRefs } = await c.req.json();
    await getScheduler().handleComplete(c.req.param("id"), leaseToken, artifactRefs ?? []);
    return c.json({ ok: true });
  });

  app.post("/attempts/:id/fail", async (c) => {
    const { leaseToken, failureType, failureReason } = await c.req.json();
    await getScheduler().handleFail(c.req.param("id"), leaseToken, failureType, failureReason);
    return c.json({ ok: true });
  });

  return app;
}
