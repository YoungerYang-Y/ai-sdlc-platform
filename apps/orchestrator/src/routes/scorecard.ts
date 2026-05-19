import { Hono } from "hono";
import type postgres from "postgres";

export function createScorecardRoutes(sql: postgres.Sql) {
  const app = new Hono();

  app.get("/scorecards/compare", async (c) => {
    const idA = c.req.query("a");
    const idB = c.req.query("b");
    if (!idA || !idB) return c.json({ error: "Both ?a and ?b workflow IDs required" }, 400);

    async function getScorecard(workflowId: string) {
      const [attempt] = await sql`
        SELECT wa.id as attempt_id, wa.implementation, asr.duration_ms, asr.final_status
        FROM worker_attempts wa
        JOIN task_runs tr ON tr.id = wa.task_run_id
        LEFT JOIN attempt_summary_reports asr ON asr.attempt_id = wa.id
        WHERE tr.workflow_run_id = ${workflowId} AND wa.status IN ('completed', 'failed')
        ORDER BY wa.finished_at DESC LIMIT 1
      `;
      if (!attempt) return { workflowId, implementation: null, status: null, durationMs: null, scorecard: null };
      const [revision] = await sql`
        SELECT dimension_scores, total_score FROM attempt_scorecard_revisions
        WHERE attempt_id = ${attempt.attempt_id} ORDER BY created_at DESC LIMIT 1
      `;
      return {
        workflowId,
        implementation: attempt.implementation,
        status: attempt.final_status,
        durationMs: attempt.duration_ms ? Number(attempt.duration_ms) : null,
        scorecard: revision ? { ...revision.dimension_scores, total: Number(revision.total_score) } : null,
      };
    }

    const [a, b] = await Promise.all([getScorecard(idA), getScorecard(idB)]);
    return c.json({ a, b });
  });

  return app;
}
