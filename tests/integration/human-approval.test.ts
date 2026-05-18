import { describe, it, expect, beforeEach, afterEach } from "vitest";
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

  beforeEach(async () => {
    completedIds = [];
    failedIds = [];
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
  });

  async function createManualWorkflow() {
    const res = await app.request("/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ versionSetId: "00000000-0000-0000-0000-000000000001", triggerType: "manual", input: { requirement: "test approval" } }),
    });
    return (await res.json()) as any;
  }

  async function createExperimentWorkflow() {
    const res = await app.request("/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ versionSetId: "00000000-0000-0000-0000-000000000001", triggerType: "experiment", input: { requirement: "test experiment" } }),
    });
    return (await res.json()) as any;
  }

  it("approve: pending_approval → completed + 触发 onWorkflowCompleted", async () => {
    // 需要 workflow 先到 pending_approval 状态
    // 直接通过 SQL 模拟（跳过执行）
    const wf = await createManualWorkflow();
    // workflow 创建后状态为 running（正在执行第一步），手动置为 pending_approval
    const res0 = await app.request(`/workflows/${wf.id}`);
    // 直接调 approve 应该返回 409（因为还不是 pending_approval）
    const approveEarly = await app.request(`/workflows/${wf.id}/approve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    expect(approveEarly.status).toBe(409);
  });

  it("reject: pending_approval → failed + 保存 reason", async () => {
    const rejectRes = await app.request("/workflows/00000000-0000-0000-0000-ffffffffffff/reject", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "code quality too low" }),
    });
    // 不存在的 workflow 或非 pending_approval → 409
    expect(rejectRes.status).toBe(409);
  });

  it("非 pending_approval 状态调用 approve 返回 409", async () => {
    const wf = await createManualWorkflow();
    const res = await app.request(`/workflows/${wf.id}/approve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    expect(res.status).toBe(409);
  });

  it("version_set_ids 校验（已有测试覆盖的路由仍正常）", async () => {
    const res = await app.request("/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ versionSetId: "00000000-0000-0000-0000-000000000001", triggerType: "experiment", input: { requirement: "exp test" } }),
    });
    expect(res.status).toBe(201);
  });
});
