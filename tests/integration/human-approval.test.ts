import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { createOrchestrator } from "../../apps/orchestrator/src/index.js";

/**
 * 集成测试：human-approval-gate。
 * 需要 PostgreSQL 运行。
 */

const DB_URL = process.env.DATABASE_URL ?? "postgresql://dev:dev@localhost:5432/ai_sdlc";

describe("Human Approval Gate", () => {
  let orchestrator: ReturnType<typeof createOrchestrator>;
  let app: ReturnType<typeof createOrchestrator>["app"];
  let completedIds: string[];
  let failedIds: string[];
  let sql: postgres.Sql;

  beforeEach(async () => {
    completedIds = [];
    failedIds = [];
    sql = postgres(DB_URL);
    orchestrator = createOrchestrator({
      port: 0,
      connectionString: DB_URL,
      onAttemptFinished: () => {},
      onWorkflowCompleted: (run) => { completedIds.push(run.id); },
      onWorkflowFailed: (run) => { failedIds.push(run.id); },
    });
    app = orchestrator.app;
    await orchestrator.start();
  });

  afterEach(async () => {
    await orchestrator.stop();
    await sql.end();
  });

  async function insertPendingApprovalWorkflow(): Promise<string> {
    const id = randomUUID();
    await sql`
      INSERT INTO workflow_runs (id, version_set_id, workflow_definition_id, trigger_type, input, status, completed_steps)
      VALUES (${id}, '00000000-0000-0000-0000-000000000001', 'default', 'manual', '{"requirement":"test"}', 'pending_approval', '["code","verify","review"]')
    `;
    return id;
  }

  it("approve: pending_approval → completed + 触发 onWorkflowCompleted", async () => {
    const id = await insertPendingApprovalWorkflow();
    const res = await app.request(`/workflows/${id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(200);
    expect(completedIds).toContain(id);

    // 验证 DB 状态
    const [row] = await sql`SELECT status FROM workflow_runs WHERE id = ${id}`;
    expect(row.status).toBe("completed");
  });

  it("reject: pending_approval → failed + rejection_reason 持久化", async () => {
    const id = await insertPendingApprovalWorkflow();
    const res = await app.request(`/workflows/${id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "code quality too low" }),
    });
    expect(res.status).toBe(200);
    expect(failedIds).toContain(id);

    const [row] = await sql`SELECT status, rejection_reason FROM workflow_runs WHERE id = ${id}`;
    expect(row.status).toBe("failed");
    expect(row.rejection_reason).toBe("code quality too low");
  });

  it("重复 approve 返回 409", async () => {
    const id = await insertPendingApprovalWorkflow();
    await app.request(`/workflows/${id}/approve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const res2 = await app.request(`/workflows/${id}/approve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    expect(res2.status).toBe(409);
  });

  it("非 pending_approval 状态调用 approve 返回 409", async () => {
    const res = await app.request("/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ versionSetId: "00000000-0000-0000-0000-000000000001", triggerType: "manual", input: { requirement: "test" } }),
    });
    const wf = await res.json() as any;
    // wf 此时为 running，调 approve 应返回 409
    const approveRes = await app.request(`/workflows/${wf.id}/approve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    expect(approveRes.status).toBe(409);
  });

  it("experiment workflow 创建后不会进入 pending_approval", async () => {
    // experiment workflow 创建后状态应为 running（执行中），不会被阻塞
    const res = await app.request("/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ versionSetId: "00000000-0000-0000-0000-000000000001", triggerType: "experiment", input: { requirement: "exp" } }),
    });
    expect(res.status).toBe(201);
    const wf = await res.json() as any;
    // 应为 running（第一步已提交），不是 pending_approval
    expect(wf.status).not.toBe("pending_approval");
  });
});
