---
id: plan-experiment-batch-benchmark
status: in-progress
owner: "evan"
tags: [experiment, benchmark, evaluation]
created: 2026-05-18
updated: 2026-05-18
---

# 实施计划：实验批次调度 + Benchmark 管理

## 目标

实现 Phase 2 实验侧核心闭环：benchmark 管理 → 批量发起实验 → 聚合评分 → 对比结果。

## 任务清单

### T1: 数据库 Schema 迁移

**范围**：`infra/postgres/migrations/` + `infra/postgres/seeds/`

- 创建 `benchmark_suites`、`benchmark_cases`、`experiment_batches`、`experiment_batch_runs`、`run_scorecards` 表
- `benchmark_cases.source_workflow_run_id` 添加 `REFERENCES workflow_runs(id) ON DELETE SET NULL`
- 种子数据中预置一个示例 suite + 2 个 case（用于开发测试和集成测试）

**验证**：迁移脚本可执行、typecheck 通过

---

### T2: Benchmark CRUD API

**范围**：`apps/orchestrator/src/routes/benchmark.ts`（新建路由文件）

- `POST /benchmark-suites` — 创建 suite
- `GET /benchmark-suites` — 列表
- `GET /benchmark-suites/:id` — 详情（含 cases）
- `POST /benchmark-suites/:id/cases` — 手动创建 case
- `POST /benchmark-suites/:id/cases/from-workflow` — 从 workflow_run 转化
  - 字段映射：提取 requirement/repository/branch/verifyCommand，忽略 workDir/implementation
  - name 默认：requirement 前 80 字符

在 `apps/orchestrator/src/index.ts` 中 `app.route("/", benchmarkRoutes)` 挂载。

**验证**：API 可用、参数校验正确

---

### T3: Experiment Batch API + 执行

**范围**：`apps/orchestrator/src/routes/experiment.ts`（新建路由文件）

- `POST /experiment-batches` — 发起批次
  - 校验 suite 非空、version_set_ids 至少 2 个且全部存在于 version_sets 表
  - 遍历 cases × version_sets 创建 workflow_run
  - 记录 experiment_batch_runs 映射
  - batch 状态设为 running
- `GET /experiment-batches` — 列表
- `GET /experiment-batches/:id` — 详情 + runs 数组（含 scorecard）

在 `apps/orchestrator/src/index.ts` 中 `app.route("/", experimentRoutes)` 挂载。

**验证**：创建 batch 后能查到对应 workflow_run、映射正确

---

### T4: run_scorecard 聚合 + batch 状态推进

**范围**：`packages/evaluation/src/index.ts`

- `scoreAttempt` 完成后：
  - 查询 attempt → task_run → workflow_run
  - UPSERT run_scorecards（后续 attempt 覆盖前者）
  - 检查是否属于 batch，若是则使用 SELECT count + 条件 UPDATE 原子推进状态（非 read-modify-write）
- **失败路径**：当前代码中 `onAttemptFinished` 在 handleFail 时也会触发 → evaluation 的 scoreAttempt 对无 summary 的 attempt 产出 success=0 的 scorecard → run_scorecard 正常写入 → batch 正常推进。确认 `computeRuleScores(null)` 返回 `{ success: 0, efficiency: 0.5, cost: 0.5 }` 覆盖此场景。

**验证**：mock 模式下 batch 完成后 run_scorecards 正确生成、batch 状态转为 completed

---

### T5: Dashboard 实验页面

**范围**：`apps/dashboard/src/`

- 在 `main.tsx` 添加 `/experiments` 和 `/experiments/:id` 路由
- 导航栏添加"实验"入口链接
- `pages/BatchList.tsx`：显示所有 batch（状态、suite 名、进度、创建时间）
- `pages/BatchDetail.tsx`：对比表格
  - 行 = benchmark_case name
  - 列 = version_set_id（截断显示前 8 位）
  - 单元格 = total score + S/E/C 维度
  - 底部汇总行 = 各列均值
- `api.ts`：新增 `fetchBatches`、`fetchBatchDetail`

**验证**：页面渲染正确、表格数据与 API 一致

---

### T6: 集成测试

**范围**：`tests/integration/experiment-batch.test.ts`

- 使用 Hono app.request 直接测试 API（与现有集成测试模式一致）
- 依赖种子数据中的 version_set（T1 已有）
- 测试流程：创建 suite → 添加 case → 发起 batch → 验证 workflow_run 创建 → 验证 batch 状态
- 校验边界：空 suite 400、version_set < 2 返回 400

**验证**：测试通过

---

## 依赖关系

```
T1 → T2 → T3 → T4 → T5
                 ↓
                T6（T4 完成后可并行）
```

## 风险与阻塞

| 风险 | 影响 | 缓解 |
|------|------|------|
| orchestrator 文件已较大 | 可维护性下降 | T2/T3 拆分为 routes/benchmark.ts 和 routes/experiment.ts |
| batch 状态推进并发更新 | 计数不准 | 使用 SELECT count → 条件 UPDATE 原子操作，非 read-modify-write |
| workflow 失败无 attempt summary | batch 永远不完成 | 确认 computeRuleScores(null) 正确处理，eval job 仍触发 |

## 决策日志

| 决策 | 理由 |
|------|------|
| 全并行、无并发控制 | Phase 4 再引入，当前单 worker 自然限流 |
| 仅 run_scorecard，跳过 task_scorecard | 线性链下两级等价，Phase 3 再补 |
| batch 状态由 evaluation 推进 | 复用现有 eval job 机制，不侵入 scheduler |
| 表格对比视图 | 信息密度最高，实现简单 |
| version_set_ids 用 JSONB 不加关联表 | version_set 不可变不可删，API 层校验存在性足够 |
| from-workflow 忽略 workDir | 本地路径对 benchmark 重复执行无意义 |
| 路由拆分为独立文件 | orchestrator index.ts 已 200+ 行，拆分改善可维护性 |
