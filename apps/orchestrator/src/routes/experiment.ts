import { Hono } from "hono";
import type postgres from "postgres";

interface WorkflowRun {
  id: string;
}

type CreateWorkflowRun = (req: { versionSetId: string; triggerType: string; input: Record<string, unknown>; workflowDefinitionId?: string }) => Promise<WorkflowRun>;

export function createExperimentRoutes(sql: postgres.Sql, createWorkflowRun: CreateWorkflowRun) {
  const app = new Hono();

  app.post("/experiment-batches", async (c) => {
    const { suiteId, versionSetIds } = await c.req.json();
    if (!suiteId || !versionSetIds || versionSetIds.length < 2) {
      return c.json({ error: "suiteId and at least 2 versionSetIds required" }, 400);
    }
    // 校验 version_set 存在
    const vsCheck = await sql`SELECT id FROM version_sets WHERE id = ANY(${versionSetIds})`;
    if (vsCheck.length !== versionSetIds.length) {
      return c.json({ error: "one or more versionSetIds not found" }, 400);
    }
    // 校验 suite 有 cases
    const cases = await sql`SELECT * FROM benchmark_cases WHERE suite_id = ${suiteId}`;
    if (cases.length === 0) return c.json({ error: "suite has no cases" }, 400);

    const totalRuns = cases.length * versionSetIds.length;
    const [batch] = await sql`
      INSERT INTO experiment_batches (suite_id, version_set_ids, status, total_runs)
      VALUES (${suiteId}, ${sql.json(versionSetIds)}, 'running', ${totalRuns})
      RETURNING *
    `;

    for (const cs of cases) {
      for (const vsId of versionSetIds as string[]) {
        const run = await createWorkflowRun({
          versionSetId: vsId,
          triggerType: "experiment",
          input: cs.input as Record<string, unknown>,
        });
        await sql`
          INSERT INTO experiment_batch_runs (batch_id, benchmark_case_id, version_set_id, workflow_run_id)
          VALUES (${batch.id}, ${cs.id}, ${vsId}, ${run.id})
        `;
      }
    }

    return c.json(batch, 201);
  });

  app.get("/experiment-batches", async (c) => {
    const rows = await sql`
      SELECT b.*, s.name as suite_name
      FROM experiment_batches b JOIN benchmark_suites s ON s.id = b.suite_id
      ORDER BY b.created_at DESC
    `;
    return c.json(rows);
  });

  app.get("/experiment-batches/:id", async (c) => {
    const [batch] = await sql`
      SELECT b.*, s.name as suite_name
      FROM experiment_batches b JOIN benchmark_suites s ON s.id = b.suite_id
      WHERE b.id = ${c.req.param("id")}
    `;
    if (!batch) return c.json({ error: "not found" }, 404);

    const runs = await sql`
      SELECT br.benchmark_case_id, br.version_set_id, br.workflow_run_id,
             bc.name as case_name,
             wr.status as workflow_status,
             rs.dimension_scores, rs.total_score
      FROM experiment_batch_runs br
      JOIN benchmark_cases bc ON bc.id = br.benchmark_case_id
      JOIN workflow_runs wr ON wr.id = br.workflow_run_id
      LEFT JOIN run_scorecards rs ON rs.workflow_run_id = br.workflow_run_id
      WHERE br.batch_id = ${batch.id}
    `;

    return c.json({ ...batch, runs });
  });

  return app;
}
