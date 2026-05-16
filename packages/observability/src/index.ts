import { Hono } from "hono";
import { serve } from "@hono/node-server";
import postgres from "postgres";
import type { AttemptEvidenceEvent, AttemptSummaryReport } from "@ai-sdlc/worker-sdk";

export interface ObservabilityConfig {
  port: number;
  connectionString: string;
  orphanScanIntervalMs?: number;
}

export function createObservability(config: ObservabilityConfig) {
  const sql = postgres(config.connectionString);
  let scanTimer: ReturnType<typeof setInterval> | null = null;

  // --- State machine transitions ---
  async function ensureRecord(attemptId: string): Promise<void> {
    await sql`
      INSERT INTO attempt_observability_records (attempt_id, state)
      VALUES (${attemptId}, 'collecting')
      ON CONFLICT (attempt_id) DO NOTHING
    `;
  }

  async function transitionState(attemptId: string): Promise<void> {
    const [rec] = await sql`SELECT * FROM attempt_observability_records WHERE attempt_id = ${attemptId}`;
    if (!rec) return;

    const hasFinished = !!rec.finished_received_at;
    const hasSummary = !!rec.summary_received_at;

    let newState = rec.state;
    if (hasFinished && hasSummary) {
      newState = "complete";
    } else if (hasFinished && !hasSummary) {
      newState = "finished_pending_summary";
    } else if (!hasFinished && hasSummary) {
      newState = "summary_pending_finished";
    }

    if (newState !== rec.state) {
      await sql`UPDATE attempt_observability_records SET state = ${newState}, updated_at = now() WHERE attempt_id = ${attemptId}`;
      if (newState === "complete") {
        await triggerEvaluation(attemptId);
      }
    }
  }

  async function triggerEvaluation(attemptId: string): Promise<void> {
    await sql`
      INSERT INTO pending_eval_jobs (id, attempt_id, trigger, status)
      VALUES (gen_random_uuid(), ${attemptId}, 'attempt_complete', 'pending')
      ON CONFLICT DO NOTHING
    `;
  }

  // --- Orphan scanner ---
  async function scanOrphans(): Promise<void> {
    const timeout = config.orphanScanIntervalMs ?? 300000;
    const cutoff = new Date(Date.now() - timeout);
    const orphans = await sql`
      SELECT attempt_id FROM attempt_observability_records
      WHERE state NOT IN ('complete', 'orphaned')
        AND updated_at < ${cutoff}
      LIMIT 20
    `;
    for (const row of orphans) {
      await sql`
        UPDATE attempt_observability_records
        SET state = 'orphaned', was_orphaned = true, orphaned_at = now(), updated_at = now()
        WHERE attempt_id = ${row.attempt_id}
      `;
    }
  }

  // --- HTTP API ---
  const app = new Hono();

  // Evidence batch ingestion
  app.post("/attempts/:attemptId/evidence", async (c) => {
    const attemptId = c.req.param("attemptId");
    const { events } = (await c.req.json()) as { events: AttemptEvidenceEvent[] };

    await ensureRecord(attemptId);

    for (const event of events) {
      await sql`
        INSERT INTO attempt_evidence_events (event_id, attempt_id, sequence_no, event_type, occurred_at, payload_ref, payload_inline)
        VALUES (${event.eventId}, ${attemptId}, ${event.sequenceNo}, ${event.eventType}, ${event.occurredAt}, ${event.payloadRef ?? null}, ${sql.json(event.payload as any ?? null)})
        ON CONFLICT (event_id) DO NOTHING
      `;
    }

    await sql`
      UPDATE attempt_observability_records
      SET evidence_count = evidence_count + ${events.length}, last_evidence_at = now(), updated_at = now()
      WHERE attempt_id = ${attemptId}
    `;

    return c.json({ accepted: events.length });
  });

  // Summary report
  app.post("/attempts/:attemptId/summary", async (c) => {
    const attemptId = c.req.param("attemptId");
    const report = (await c.req.json()) as AttemptSummaryReport;

    await ensureRecord(attemptId);

    await sql`
      INSERT INTO attempt_summary_reports (attempt_id, task_run_id, worker_id, version_set_id, final_status, started_at, finished_at, duration_ms, token_totals, cost_totals, tool_stats, artifact_refs, failure_type, failure_reason, checkpoint_digest, final_conclusion)
      VALUES (${attemptId}, ${report.taskRunId}, ${report.workerId}, ${report.versionSetId}, ${report.finalStatus}, ${report.startedAt}, ${report.finishedAt}, ${report.durationMs}, ${sql.json(report.tokenTotals as any)}, ${sql.json(report.costTotals as any)}, ${sql.json(report.toolStats as any)}, ${sql.json(report.artifactRefs as any)}, ${report.failureType ?? null}, ${report.failureReason ?? null}, ${report.checkpointDigest}, ${report.finalConclusion})
      ON CONFLICT (attempt_id) DO NOTHING
    `;

    await sql`
      UPDATE attempt_observability_records SET summary_received_at = now(), updated_at = now()
      WHERE attempt_id = ${attemptId}
    `;

    await transitionState(attemptId);
    return c.json({ ok: true });
  });

  // Attempt finished notification (from Scheduler)
  app.post("/attempts/:attemptId/finished", async (c) => {
    const attemptId = c.req.param("attemptId");
    await ensureRecord(attemptId);
    await sql`
      UPDATE attempt_observability_records SET finished_received_at = now(), updated_at = now()
      WHERE attempt_id = ${attemptId}
    `;
    await transitionState(attemptId);
    return c.json({ ok: true });
  });

  // Query endpoints
  app.get("/attempts/:attemptId/status", async (c) => {
    const [rec] = await sql`SELECT * FROM attempt_observability_records WHERE attempt_id = ${c.req.param("attemptId")}`;
    if (!rec) return c.json({ error: "not found" }, 404);
    return c.json(rec);
  });

  app.get("/attempts/:attemptId/timeline", async (c) => {
    const events = await sql`
      SELECT * FROM attempt_evidence_events WHERE attempt_id = ${c.req.param("attemptId")} ORDER BY sequence_no
    `;
    return c.json(events);
  });

  return {
    app,
    async start() {
      scanTimer = setInterval(() => void scanOrphans(), config.orphanScanIntervalMs ?? 300000);
      serve({ fetch: app.fetch, port: config.port });
      console.log(`Observability running on :${config.port}`);
    },
    async stop() {
      if (scanTimer) clearInterval(scanTimer);
      await sql.end();
    },
  };
}
