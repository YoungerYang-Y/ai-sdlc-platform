import { Hono } from "hono";
import type postgres from "postgres";

export function createBenchmarkRoutes(sql: postgres.Sql) {
  const app = new Hono();

  app.post("/benchmark-suites", async (c) => {
    const { name, description } = await c.req.json();
    if (!name) return c.json({ error: "name required" }, 400);
    const [suite] = await sql`INSERT INTO benchmark_suites (name, description) VALUES (${name}, ${description ?? ""}) RETURNING *`;
    return c.json(suite, 201);
  });

  app.get("/benchmark-suites", async (c) => {
    const rows = await sql`
      SELECT s.*, (SELECT count(*) FROM benchmark_cases WHERE suite_id = s.id)::int as case_count
      FROM benchmark_suites s ORDER BY s.created_at DESC
    `;
    return c.json(rows);
  });

  app.get("/benchmark-suites/:id", async (c) => {
    const [suite] = await sql`SELECT * FROM benchmark_suites WHERE id = ${c.req.param("id")}`;
    if (!suite) return c.json({ error: "not found" }, 404);
    const cases = await sql`SELECT * FROM benchmark_cases WHERE suite_id = ${suite.id} ORDER BY created_at`;
    return c.json({ ...suite, cases });
  });

  app.post("/benchmark-suites/:id/cases", async (c) => {
    const suiteId = c.req.param("id");
    const { name, input } = await c.req.json();
    if (!name || !input?.requirement) return c.json({ error: "name and input.requirement required" }, 400);
    const [row] = await sql`INSERT INTO benchmark_cases (suite_id, name, input) VALUES (${suiteId}, ${name}, ${sql.json(input)}) RETURNING *`;
    return c.json(row, 201);
  });

  app.post("/benchmark-suites/:id/cases/from-workflow", async (c) => {
    const suiteId = c.req.param("id");
    const { workflowRunId, name } = await c.req.json();
    if (!workflowRunId) return c.json({ error: "workflowRunId required" }, 400);
    const [wf] = await sql`SELECT * FROM workflow_runs WHERE id = ${workflowRunId}`;
    if (!wf) return c.json({ error: "workflow not found" }, 404);
    const wfInput = wf.input as Record<string, unknown>;
    // 提取 requirement/repository/branch/verifyCommand，忽略 workDir/implementation
    const caseInput: Record<string, unknown> = { requirement: wfInput.requirement };
    if (wfInput.repository) caseInput.repository = wfInput.repository;
    if (wfInput.branch) caseInput.branch = wfInput.branch;
    if (wfInput.verifyCommand) caseInput.verifyCommand = wfInput.verifyCommand;
    const caseName = name ?? (wfInput.requirement as string)?.slice(0, 80) ?? "unnamed";
    const [row] = await sql`
      INSERT INTO benchmark_cases (suite_id, name, input, source_workflow_run_id)
      VALUES (${suiteId}, ${caseName}, ${sql.json(caseInput as any)}, ${workflowRunId}) RETURNING *
    `;
    return c.json(row, 201);
  });

  return app;
}
