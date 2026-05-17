import postgres from "postgres";

export interface EvaluationConfig {
  connectionString: string;
  pollIntervalMs?: number;
  /** efficiency 满分线（毫秒），默认 600000 (10min) */
  efficiencyBaselineMs?: number;
  /** efficiency 零分线（毫秒），默认 3600000 (60min) */
  efficiencyMaxMs?: number;
  /** cost 满分线（token 数），默认 1000 */
  costBaselineTokens?: number;
  /** cost 零分线（token 数），默认 100000 */
  costMaxTokens?: number;
}

interface DimensionScores {
  success: number;
  efficiency: number;
  cost: number;
}

const WEIGHT_SNAPSHOT: Record<keyof DimensionScores, number> = {
  success: 0.5,
  efficiency: 0.3,
  cost: 0.2,
};

export function createEvaluation(config: EvaluationConfig) {
  const sql = postgres(config.connectionString);
  let timer: ReturnType<typeof setInterval> | null = null;

  async function processPendingJobs(): Promise<number> {
    const jobs = await sql`
      WITH batch AS (
        SELECT id FROM pending_eval_jobs WHERE status = 'pending' LIMIT 10 FOR UPDATE SKIP LOCKED
      )
      UPDATE pending_eval_jobs SET status = 'processing', updated_at = now()
      WHERE id IN (SELECT id FROM batch)
      RETURNING *
    `;

    for (const job of jobs) {
      try {
        await scoreAttempt(job.attempt_id);
        await sql`UPDATE pending_eval_jobs SET status = 'completed', updated_at = now() WHERE id = ${job.id}`;
      } catch (err) {
        const retries = (job.retries ?? 0) + 1;
        const newStatus = retries >= job.max_retries ? "failed" : "pending";
        await sql`UPDATE pending_eval_jobs SET status = ${newStatus}, retries = ${retries}, updated_at = now() WHERE id = ${job.id}`;
      }
    }
    return jobs.length;
  }

  async function scoreAttempt(attemptId: string): Promise<void> {
    const [summary] = await sql`SELECT * FROM attempt_summary_reports WHERE attempt_id = ${attemptId}`;

    const dimensions = computeRuleScores(summary ?? null);
    const totalScore = Object.entries(WEIGHT_SNAPSHOT).reduce(
      (sum, [key, weight]) => sum + dimensions[key as keyof DimensionScores] * weight, 0,
    );

    const revisionId = crypto.randomUUID();

    // Upsert scorecard
    await sql`
      INSERT INTO attempt_scorecards (attempt_id, latest_revision_id, state)
      VALUES (${attemptId}, ${revisionId}, 'scored')
      ON CONFLICT (attempt_id) DO UPDATE SET latest_revision_id = ${revisionId}, state = 'scored', updated_at = now()
    `;

    // Insert revision
    await sql`
      INSERT INTO attempt_scorecard_revisions (id, attempt_id, source, trigger, weight_snapshot, dimension_scores, total_score, model_or_rubric_version, created_by)
      VALUES (${revisionId}, ${attemptId}, 'rule', 'attempt_complete', ${sql.json(WEIGHT_SNAPSHOT as unknown as Record<string, number>)}, ${sql.json(dimensions as unknown as Record<string, number>)}, ${totalScore}, 'rule-scorer-v1', 'system')
    `;
  }

  function computeRuleScores(summary: Record<string, unknown> | null): DimensionScores {
    if (!summary) {
      return { success: 0, efficiency: 0.5, cost: 0.5 };
    }

    const success = summary.final_status === "completed" ? 1.0 : 0.0;

    const effBaseline = config.efficiencyBaselineMs ?? 600000;
    const effMax = config.efficiencyMaxMs ?? 3600000;
    const durationMs = Number(summary.duration_ms ?? effBaseline);
    const efficiency = Math.max(0, Math.min(1, 1 - (durationMs - effBaseline) / (effMax - effBaseline)));

    const costBaseline = config.costBaselineTokens ?? 1000;
    const costMax = config.costMaxTokens ?? 100000;
    const tokenTotals = summary.token_totals as { total?: number } | null;
    const tokens = tokenTotals?.total ?? 10000;
    const cost = Math.max(0, Math.min(1, 1 - (tokens - costBaseline) / (costMax - costBaseline)));

    return { success, efficiency, cost };
  }

  return {
    processPendingJobs,
    start() {
      const interval = config.pollIntervalMs ?? 10000;
      timer = setInterval(() => void processPendingJobs(), interval);
    },
    async stop() {
      if (timer) clearInterval(timer);
      await sql.end();
    },
  };
}
