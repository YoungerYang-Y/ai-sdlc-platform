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

**范围**：`infra/postgres/migrations/`

- 创建 `benchmark_suites`、`benchmark_cases`、`experiment_batches`、`experiment_batch_runs`、`run_scorecards` 表
- 更新种子数据脚本（可选：预置一个示例 suite）

**验证**：迁移脚本可执行、typecheck 通过

---

### T2: Benchmark CRUD API

**范围**：`apps/orchestrator/src/index.ts`

- `POST /benchmark-suites` — 创建 suite
- `GET /benchmark-suites` — 列表
- `GET /benchmark-suites/:id` — 详情（含 cases）
- `POST /benchmark-suites/:id/cases` — 手动创建 case
- `POST /benchmark-suites/:id/cases/from-workflow` — 从 workflow_run 转化

**验证**：API 可用、参数校验正确

---

### T3: Experiment Batch API + 执行

**范围**：`apps/orchestrator/src/index.ts`

- `POST /experiment-batches` — 发起批次
  - 校验 suite 非空、version_set_ids 有效
  - 遍历 cases × version_sets 创建 workflow_run
  - 记录 experiment_batch_runs 映射
  - batch 状态设为 running
- `GET /experiment-batches` — 列表
- `GET /experiment-batches/:id` — 详情 + 对比结果矩阵

**验证**：创建 batch 后能查到对应 workflow_run、映射正确

---

### T4: run_scorecard 聚合 + batch 状态推进

**范围**：`packages/evaluation/src/index.ts`

- `scoreAttempt` 完成后：
  - 查询 attempt → task_run → workflow_run
  - 写入 run_scorecards（幂等 UPSERT）
  - 检查是否属于 batch，若是则 `UPDATE experiment_batches SET completed_runs = completed_runs + 1`
  - 若 completed_runs + failed_runs = total_runs，标记 batch 为 completed
- workflow_run 失败时也需要更新 batch（在 onTaskFailed → workflow failed 路径中通知 evaluation）

**验证**：mock 模式下 batch 完成后 run_scorecards 正确生成、batch 状态转为 completed

---

### T5: Dashboard 实验页面

**范围**：`apps/dashboard/src/`

- 新增路由 `/experiments`
- `BatchListPage`：显示所有 batch（状态、suite 名、创建时间）
- `BatchDetailPage`：对比表格
  - 行 = benchmark_case name
  - 列 = version_set_id（显示为 implementation 名或截断 ID）
  - 单元格 = total score + success/efficiency/cost 色标
  - 底部汇总行 = 各列均值
- `apps/dashboard/src/api.ts`：新增 `fetchBatches`、`fetchBatchDetail`、`fetchSuites` 等

**验证**：页面渲染正确、表格数据与 API 一致

---

### T6: 集成测试

**范围**：`tests/`

- 测试完整流程：创建 suite → 添加 case → 发起 batch → workflow 完成 → 验证对比结果
- 使用 mock worker 模式

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
| orchestrator 文件已较大 | 可维护性下降 | 可考虑拆分路由文件，但本次不做 |
| batch 状态推进并发更新 | 计数不准 | 使用原子 SQL（+1）而非 read-modify-write |

## 决策日志

| 决策 | 理由 |
|------|------|
| 全并行、无并发控制 | Phase 4 再引入，当前单 worker 自然限流 |
| 仅 run_scorecard，不做 task_scorecard | 线性链下两级等价 |
| batch 状态由 evaluation 推进 | 复用现有 eval job 机制，不侵入 scheduler |
| 表格对比视图 | 信息密度最高，实现简单 |
