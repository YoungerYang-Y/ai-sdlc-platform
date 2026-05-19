import postgres from "postgres";
import { computeRuleScores, WEIGHT_SNAPSHOT, type DimensionScores } from "./scorer.js";
import { createAggregator } from "./aggregator.js";

export interface EvaluationConfig {
  connectionString: string;
  pollIntervalMs?: number;
  efficiencyBaselineMs?: number;
  efficiencyMaxMs?: number;
  costBaselineTokens?: number;
  costMaxTokens?: number;
}

export function createEvaluation(config: EvaluationConfig) {
  const sql = postgres(config.connectionString);
  const aggregator = createAggregator(sql);
  let timer: ReturnType<typeof setInterval> | null = null;

  async function processPendingJobs(): Promise<number> {
    const jobs = await sql`
      WITH batch AS (SELECT id FROM pending_eval_jobs WHERE status = 'pending' LIMIT 10 FOR UPDATE SKIP LOCKED)
      UPDATE pending_eval_jobs SET status = 'processing', updated_at = now()
      WHERE id IN (SELECT id FROM batch) RETURNING *
    `;
    for (const job of jobs) {
      try {
        await scoreAttempt(job.attempt_id);
        await sql`UPDATE pending_eval_jobs SET status = 'completed', updated_at = now() WHERE id = ${job.id}`;
      } catch {
        const retries = (job.retries ?? 0) + 1;
        const newStatus = retries >= job.max_retries ? "failed" : "pending";
        await sql`UPDATE pending_eval_jobs SET status = ${newStatus}, retries = ${retries}, updated_at = now() WHERE id = ${job.id}`;
      }
    }
    return jobs.length;
  }

  async function scoreAttempt(attemptId: string): Promise<void> {
    const [summary] = await sql`SELECT * FROM attempt_summary_reports WHERE attempt_id = ${attemptId}`;
    const dimensions = computeRuleScores(summary ?? null, config);
    const totalScore = Object.entries(WEIGHT_SNAPSHOT).reduce(
      (sum, [key, weight]) => sum + dimensions[key as keyof DimensionScores] * weight, 0,
    );
    const revisionId = crypto.randomUUID();
    await sql`
      INSERT INTO attempt_scorecards (attempt_id, latest_revision_id, state)
      VALUES (${attemptId}, ${revisionId}, 'scored')
      ON CONFLICT (attempt_id) DO UPDATE SET latest_revision_id = ${revisionId}, state = 'scored', updated_at = now()
    `;
    await sql`
      INSERT INTO attempt_scorecard_revisions (id, attempt_id, source, trigger, weight_snapshot, dimension_scores, total_score, model_or_rubric_version, created_by)
      VALUES (${revisionId}, ${attemptId}, 'rule', 'attempt_complete', ${sql.json(WEIGHT_SNAPSHOT as unknown as Record<string, number>)}, ${sql.json(dimensions as unknown as Record<string, number>)}, ${totalScore}, 'rule-scorer-v1', 'system')
    `;
    await aggregator.aggregateRunScorecard(attemptId, dimensions, totalScore);
  }

  return {
    processPendingJobs,
    start() { timer = setInterval(() => void processPendingJobs(), config.pollIntervalMs ?? 10000); },
    async stop() { if (timer) clearInterval(timer); await sql.end(); },
  };
}
