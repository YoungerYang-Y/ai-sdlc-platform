import { describe, it, expect, beforeEach } from "vitest";
import { createOrchestrator } from "../../apps/orchestrator/src/index.js";

/**
 * 集成测试：experiment-batch API。
 * 需要 PostgreSQL 运行（与 scheduler/observability 测试相同）。
 */

const DB_URL = process.env.DATABASE_URL ?? "postgresql://dev:dev@localhost:5432/ai_sdlc";

describe("Experiment Batch API", () => {
  let app: ReturnType<typeof createOrchestrator>["app"];

  beforeEach(() => {
    const orchestrator = createOrchestrator({
      port: 0,
      connectionString: DB_URL,
      onAttemptFinished: () => {},
    });
    app = orchestrator.app;
  });

  it("完整流程：创建 suite → case → batch", async () => {
    // 创建 suite
    const suiteRes = await app.request("/benchmark-suites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "integ-test-suite" }),
    });
    expect(suiteRes.status).toBe(201);
    const suite = await suiteRes.json() as any;

    // 添加 case
    const caseRes = await app.request(`/benchmark-suites/${suite.id}/cases`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "test-case", input: { requirement: "add hello" } }),
    });
    expect(caseRes.status).toBe(201);

    // 查询 suite 详情含 cases
    const detailRes = await app.request(`/benchmark-suites/${suite.id}`);
    const detail = await detailRes.json() as any;
    expect(detail.cases).toHaveLength(1);

    // 创建 batch（使用种子数据中的 version_set）
    const batchRes = await app.request("/experiment-batches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        suiteId: suite.id,
        versionSetIds: ["00000000-0000-0000-0000-000000000001", "00000000-0000-0000-0000-000000000002"],
      }),
    });
    expect(batchRes.status).toBe(201);
    const batch = await batchRes.json() as any;
    expect(batch.total_runs).toBe(2);
    expect(batch.status).toBe("running");

    // 查询 batch 详情
    const batchDetailRes = await app.request(`/experiment-batches/${batch.id}`);
    expect(batchDetailRes.status).toBe(200);
    const batchDetail = await batchDetailRes.json() as any;
    expect(batchDetail.runs).toHaveLength(2);
  });

  it("空 suite 发起 batch 返回 400", async () => {
    const suiteRes = await app.request("/benchmark-suites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "empty-suite" }),
    });
    const suite = await suiteRes.json() as any;

    const batchRes = await app.request("/experiment-batches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        suiteId: suite.id,
        versionSetIds: ["00000000-0000-0000-0000-000000000001", "00000000-0000-0000-0000-000000000002"],
      }),
    });
    expect(batchRes.status).toBe(400);
  });

  it("version_set 少于 2 个返回 400", async () => {
    const batchRes = await app.request("/experiment-batches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        suiteId: "00000000-0000-0000-0000-000000000010",
        versionSetIds: ["00000000-0000-0000-0000-000000000001"],
      }),
    });
    expect(batchRes.status).toBe(400);
  });

  it("不存在的 version_set 返回 400", async () => {
    const batchRes = await app.request("/experiment-batches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        suiteId: "00000000-0000-0000-0000-000000000010",
        versionSetIds: ["00000000-0000-0000-0000-000000000001", "00000000-0000-0000-0000-ffffffffffffffff"],
      }),
    });
    expect(batchRes.status).toBe(400);
  });
});
