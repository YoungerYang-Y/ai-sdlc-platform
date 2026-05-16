import { describe, it, expect, beforeEach, afterEach } from "vitest";
import postgres from "postgres";
import { createObservability } from "../src/index.js";

const DB_URL = "postgresql://dev:dev@localhost:5432/ai_sdlc";
const ATTEMPT_ID = "dddddddd-dddd-dddd-dddd-dddddddddddd";

describe("Observability State Machine", () => {
  let sql: ReturnType<typeof postgres>;
  let obs: ReturnType<typeof createObservability>;
  const baseUrl = "http://localhost:19002";

  beforeEach(async () => {
    sql = postgres(DB_URL);
    await sql`DELETE FROM pending_eval_jobs`;
    await sql`DELETE FROM attempt_observability_records`;
    await sql`DELETE FROM attempt_summary_reports`;
    await sql`DELETE FROM attempt_evidence_events`;
    await sql`DELETE FROM worker_attempts`;
    await sql`DELETE FROM task_runs`;
    await sql`DELETE FROM workflow_runs`;
    await sql`INSERT INTO workflow_runs (id, version_set_id, trigger_type, input, status, completed_steps) VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-000000000001', 'manual', '{"r":"t"}'::jsonb, 'running', '[]'::jsonb)`;
    await sql`INSERT INTO task_runs (id, workflow_run_id, task_type, status) VALUES ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'code', 'claimed')`;
    await sql`INSERT INTO worker_attempts (id, task_run_id, worker_id, implementation, version_set_id, status, attempt_number, lease_token, lease_expires_at, last_heartbeat_at) VALUES (${ATTEMPT_ID}, 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'w1', 'codex', '00000000-0000-0000-0000-000000000001', 'completed', 1, 'tok1', now(), now())`;

    obs = createObservability({ port: 19002, connectionString: DB_URL });
    await obs.start();
  });

  afterEach(async () => {
    await obs.stop();
    await sql.end();
  });

  it("evidence ingestion creates collecting state", async () => {
    await fetch(`${baseUrl}/attempts/${ATTEMPT_ID}/evidence`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events: [{ eventId: "e1", attemptId: ATTEMPT_ID, sequenceNo: 0, eventType: "context_loaded", occurredAt: new Date().toISOString(), payload: { x: 1 } }] }),
    });
    const [rec] = await sql`SELECT * FROM attempt_observability_records WHERE attempt_id = ${ATTEMPT_ID}`;
    expect(rec.state).toBe("collecting");
    expect(rec.evidence_count).toBe(1);
  });

  it("deduplicates events by eventId", async () => {
    const event = { eventId: "dup1", attemptId: ATTEMPT_ID, sequenceNo: 0, eventType: "context_loaded", occurredAt: new Date().toISOString(), payload: {} };
    await fetch(`${baseUrl}/attempts/${ATTEMPT_ID}/evidence`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ events: [event] }) });
    await fetch(`${baseUrl}/attempts/${ATTEMPT_ID}/evidence`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ events: [event] }) });
    const events = await sql`SELECT * FROM attempt_evidence_events WHERE attempt_id = ${ATTEMPT_ID}`;
    expect(events.length).toBe(1);
  });

  const summaryBody = JSON.stringify({ attemptId: ATTEMPT_ID, taskRunId: "cccccccc-cccc-cccc-cccc-cccccccccccc", workerId: "w1", versionSetId: "00000000-0000-0000-0000-000000000001", finalStatus: "completed", startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), durationMs: 1000, tokenTotals: { input: 10, output: 20, total: 30 }, costTotals: { totalUsd: 0 }, toolStats: { totalCalls: 1, successCount: 1, failedCount: 0 }, artifactRefs: [], checkpointDigest: "", finalConclusion: "ok" });

  it("summary then finished → complete + eval job", async () => {
    await fetch(`${baseUrl}/attempts/${ATTEMPT_ID}/summary`, { method: "POST", headers: { "Content-Type": "application/json" }, body: summaryBody });
    let [rec] = await sql`SELECT state FROM attempt_observability_records WHERE attempt_id = ${ATTEMPT_ID}`;
    expect(rec.state).toBe("summary_pending_finished");

    await fetch(`${baseUrl}/attempts/${ATTEMPT_ID}/finished`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    [rec] = await sql`SELECT state FROM attempt_observability_records WHERE attempt_id = ${ATTEMPT_ID}`;
    expect(rec.state).toBe("complete");

    const jobs = await sql`SELECT * FROM pending_eval_jobs WHERE attempt_id = ${ATTEMPT_ID}`;
    expect(jobs.length).toBe(1);
  });

  it("finished then summary → complete (reverse order)", async () => {
    await fetch(`${baseUrl}/attempts/${ATTEMPT_ID}/finished`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    let [rec] = await sql`SELECT state FROM attempt_observability_records WHERE attempt_id = ${ATTEMPT_ID}`;
    expect(rec.state).toBe("finished_pending_summary");

    await fetch(`${baseUrl}/attempts/${ATTEMPT_ID}/summary`, { method: "POST", headers: { "Content-Type": "application/json" }, body: summaryBody });
    [rec] = await sql`SELECT state FROM attempt_observability_records WHERE attempt_id = ${ATTEMPT_ID}`;
    expect(rec.state).toBe("complete");
  });
});
