import { Hono } from "hono";
import type postgres from "postgres";
import type { WorkflowRun, OrchestratorConfig } from "../index.js";
import { mapWorkflowRun } from "../helpers.js";

export function createWorkflowRoutes(sql: postgres.Sql, engine: { createWorkflowRun: (req: any) => Promise<WorkflowRun> }, config: OrchestratorConfig) {
  const app = new Hono();

  app.post("/workflows", async (c) => {
    const body = await c.req.json();
    if (!body.versionSetId || !body.triggerType || !body.input) return c.json({ error: "Missing required fields: versionSetId, triggerType, input" }, 400);
    if (!body.input.requirement) return c.json({ error: "Missing input.requirement" }, 400);
    const run = await engine.createWorkflowRun(body);
    return c.json(run, 201);
  });

  app.get("/workflows/:id", async (c) => {
    const [row] = await sql`SELECT * FROM workflow_runs WHERE id = ${c.req.param("id")}`;
    if (!row) return c.json({ error: "not found" }, 404);
    return c.json(row);
  });

  app.get("/workflows", async (c) => {
    const status = c.req.query("status");
    const limit = Math.min(Number(c.req.query("limit") ?? 50), 100);
    const rows = status
      ? await sql`SELECT id, status, trigger_type, created_at, finished_at, input->>'requirement' as requirement FROM workflow_runs WHERE status = ${status} ORDER BY created_at DESC LIMIT ${limit}`
      : await sql`SELECT id, status, trigger_type, created_at, finished_at, input->>'requirement' as requirement FROM workflow_runs ORDER BY created_at DESC LIMIT ${limit}`;
    return c.json(rows);
  });

  app.post("/workflows/:id/cancel", async (c) => {
    await sql`UPDATE workflow_runs SET status = 'cancelled', finished_at = now(), updated_at = now() WHERE id = ${c.req.param("id")}`;
    return c.json({ ok: true });
  });

  app.post("/workflows/:id/approve", async (c) => {
    const id = c.req.param("id");
    const [row] = await sql`UPDATE workflow_runs SET status = 'completed', finished_at = now(), updated_at = now() WHERE id = ${id} AND status = 'pending_approval' RETURNING *`;
    if (!row) return c.json({ error: "not in pending_approval state" }, 409);
    const run = mapWorkflowRun(row);
    console.log(JSON.stringify({ event: "workflow_approval", action: "approve", workflowId: id }));
    try { config.onWorkflowCompleted?.(run); } catch (err) { console.error("onWorkflowCompleted failed", err); }
    return c.json({ ok: true });
  });

  app.post("/workflows/:id/reject", async (c) => {
    const id = c.req.param("id");
    const { reason } = await c.req.json().catch(() => ({ reason: undefined }));
    const [row] = await sql`UPDATE workflow_runs SET status = 'failed', finished_at = now(), rejection_reason = ${reason ?? null}, updated_at = now() WHERE id = ${id} AND status = 'pending_approval' RETURNING *`;
    if (!row) return c.json({ error: "not in pending_approval state" }, 409);
    const run = mapWorkflowRun(row);
    console.log(JSON.stringify({ event: "workflow_approval", action: "reject", workflowId: id, reason: reason ?? null }));
    try { config.onWorkflowFailed?.(run); } catch (err) { console.error("onWorkflowFailed failed", err); }
    return c.json({ ok: true });
  });

  return app;
}
