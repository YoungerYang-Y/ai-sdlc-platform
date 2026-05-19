import type postgres from "postgres";
import type { DimensionScores } from "./scorer.js";

export function createAggregator(sql: postgres.Sql) {

  async function aggregateRunScorecard(attemptId: string, dimensions: DimensionScores, totalScore: number): Promise<void> {
    const [attempt] = await sql`SELECT task_run_id FROM worker_attempts WHERE id = ${attemptId}`;
    if (!attempt) return;
    const [task] = await sql`SELECT workflow_run_id FROM task_runs WHERE id = ${attempt.task_run_id}`;
    if (!task) return;

    const workflowRunId = task.workflow_run_id;

    await sql`
      INSERT INTO run_scorecards (workflow_run_id, dimension_scores, total_score, source_attempt_id)
      VALUES (${workflowRunId}, ${sql.json(dimensions as unknown as Record<string, number>)}, ${totalScore}, ${attemptId})
      ON CONFLICT (workflow_run_id) DO UPDATE SET
        dimension_scores = EXCLUDED.dimension_scores, total_score = EXCLUDED.total_score,
        source_attempt_id = EXCLUDED.source_attempt_id, created_at = now()
    `;

    const [batchRun] = await sql`SELECT batch_id FROM experiment_batch_runs WHERE workflow_run_id = ${workflowRunId}`;
    if (batchRun) await advanceBatchStatus(batchRun.batch_id);
  }

  async function advanceBatchStatus(batchId: string): Promise<void> {
    // 并发安全：SELECT count 基于实际 workflow 状态，UPDATE ... WHERE status = 'running' 保证幂等
    const [counts] = await sql`
      SELECT count(*) FILTER (WHERE wr.status = 'completed')::int as completed,
             count(*) FILTER (WHERE wr.status = 'failed')::int as failed
      FROM experiment_batch_runs br JOIN workflow_runs wr ON wr.id = br.workflow_run_id
      WHERE br.batch_id = ${batchId}
    `;
    const completed = Number(counts.completed);
    const failed = Number(counts.failed);
    const [batch] = await sql`SELECT total_runs FROM experiment_batches WHERE id = ${batchId}`;
    if (!batch) return;

    if (completed + failed >= batch.total_runs) {
      await sql`UPDATE experiment_batches SET completed_runs = ${completed}, failed_runs = ${failed}, status = 'completed', finished_at = now() WHERE id = ${batchId} AND status = 'running'`;
    } else {
      await sql`UPDATE experiment_batches SET completed_runs = ${completed}, failed_runs = ${failed} WHERE id = ${batchId}`;
    }
  }

  return { aggregateRunScorecard };
}
