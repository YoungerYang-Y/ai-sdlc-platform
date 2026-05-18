import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createOrchestrator } from "../../apps/orchestrator/src/index.js";

/**
 * 集成测试：experiment-batch API。
 * 需要 PostgreSQL 运行（与 scheduler/observability 测试相同）。
 */

const DB_URL = process.env.DATABASE_URL ?? "postgresql://dev:dev@localhost:5432/ai_sdlc";

describe("Benchmark CRUD API", () => {
  let app: ReturnType<typeof createOrchestrator>["app"];

  beforeEach(() => {
    const orchestrator = createOrchestrator({
      port: 0,
      connectionString: DB_URL,
      onAttemptFinished: () => {},
    });
    app = orchestrator.app;
  });

  it("创建 suite + case + 查询详情", async () => {
    const suiteRes = await app.request("/benchmark-suites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "integ-test-suite" }),
    });
    expect(suiteRes.status).toBe(201);
    const suite = await suiteRes.json() as any;

    const caseRes = await app.request(`/benchmark-suites/${suite.id}/cases`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "test-case", input: { requirement: "add hello" } }),
    });
    expect(caseRes.status).toBe(201);

    const detailRes = await app.request(`/benchmark-suites/${suite.id}`);
    const detail = await detailRes.json() as any;
    expect(detail.cases).toHaveLength(1);
  });

  it("case 缺少 requirement 返回 400", async () => {
    const suiteRes = await app.request("/benchmark-suites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "s" }),
    });
    const suite = await suiteRes.json() as any;

    const res = await app.request(`/benchmark-suites/${suite.id}/cases`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "c", input: {} }),
    });
    expect(res.status).toBe(400);
  });
});

describe("Experiment Batch API", () => {
  let orchestrator: ReturnType<typeof createOrchestrator>;
  let app: ReturnType<typeof createOrchestrator>["app"];

  beforeEach(async () => {
    orchestrator = createOrchestrator({
      port: 0,
      connectionString: DB_URL,
      onAttemptFinished: () => {},
    });
    app = orchestrator.app;
    await orchestrator.start();
  });

  afterEach(async () => {
    await orchestrator.stop();
  });

  it("创建 batch 完整流程", async () => {
    const suiteRes = await app.request("/benchmark-suites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "batch-test-suite" }),
    });
    const suite = await suiteRes.json() as any;

    await app.request(`/benchmark-suites/${suite.id}/cases`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "c1", input: { requirement: "hello world" } }),
    });

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

    const detailRes = await app.request(`/experiment-batches/${batch.id}`);
    expect(detailRes.status).toBe(200);
    const detail = await detailRes.json() as any;
    expect(detail.runs).toHaveLength(2);
  });

  it("空 suite 发起 batch 返回 400", async () => {
    const suiteRes = await app.request("/benchmark-suites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "empty" }),
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
    const res = await app.request("/experiment-batches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ suiteId: "00000000-0000-0000-0000-000000000010", versionSetIds: ["00000000-0000-0000-0000-000000000001"] }),
    });
    expect(res.status).toBe(400);
  });

  it("无效 UUID 格式返回 400", async () => {
    const res = await app.request("/experiment-batches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ suiteId: "00000000-0000-0000-0000-000000000010", versionSetIds: ["not-a-uuid", "also-bad"] }),
    });
    expect(res.status).toBe(400);
  });
});
