---
id: spec-experiment-batch-benchmark
status: draft
owner: "evan"
tags: [experiment, benchmark, evaluation]
created: 2026-05-18
updated: 2026-05-18
---

# 产品规格：实验批次调度 + Benchmark 管理

## 问题与动机

当前平台虽然有 scorecard compare API，但只能手动逐个创建 workflow 再对比——无法规模化验证配置差异。没有 benchmark 管理，"实验可重复性"不成立。操作者无法回答"配置 A 和配置 B 在同一组任务上的表现差异"。

## 目标用户

- **平台操作者**：负责调优 worker 配置（model、prompt、runtime 参数），需要对比不同 version_set 的效果

## 功能边界

**做什么（In Scope）**：
- benchmark_case 和 benchmark_suite 的 CRUD
- 从历史 workflow_run 一键转为 benchmark_case
- 发起 experiment_batch（选定 suite × 多个 version_set）
- 批次创建时一次性创建所有 workflow_run（全并行）
- workflow_run 完成后聚合 run_scorecard
- batch 完成后提供对比结果（表格：行=case, 列=version_set）
- Dashboard 实验页面：batch 列表 + batch 详情对比表格

**不做什么（Out of Scope）**：
- 并发控制 / 资源配额（Phase 4）
- 人工校准 / calibration queue（Phase 3）
- task_scorecard 聚合（当前线性链无需）
- batch_scorecard 对象（视图层聚合即可）
- 雷达图 / 高级可视化

## 用户场景

### 场景 1：手动创建 Benchmark Suite

1. 操作者创建一个 benchmark_suite（命名如"基础 REST API 任务集"）
2. 操作者向 suite 中添加多个 benchmark_case（每个包含 requirement、repository、verifyCommand 等）
3. 系统持久化 suite 和 case

### 场景 2：从历史 Workflow 转化 Benchmark Case

1. 操作者选择一个已完成的 workflow_run
2. 操作者执行"转为 benchmark"操作
3. 系统提取 workflow_run 的 input 字段，创建 benchmark_case 并关联到指定 suite

### 场景 3：发起实验批次

1. 操作者选择一个 benchmark_suite 和 2+ 个 version_set
2. 操作者发起 experiment_batch
3. 系统为每个 (case, version_set) 组合创建 workflow_run
4. 所有 workflow_run 并行执行
5. 操作者在 Dashboard 看到批次进度

### 场景 4：查看对比结果

1. 批次中所有 workflow_run 完成/失败
2. 批次状态变为 completed
3. 操作者进入批次详情页
4. 看到表格：行是 benchmark_case 名称，列是 version_set，单元格显示 total 分数 + success/efficiency/cost 维度分，底部汇总行显示各 version_set 的均值

## 输入与输出（用户视角）

| 方向 | 用户提供/看到什么 | 约束 |
|------|-------------------|------|
| 输入 | suite 名称 + case 列表（requirement、repo、verify 等） | case 至少 1 个 |
| 输入 | batch：suite_id + version_set_ids | version_set 至少 2 个 |
| 输出 | batch 进度（pending/running/completed） | — |
| 输出 | 对比表格（case × version_set → 分数） | 所有 run 完成后可用 |

## 验收标准

- [ ] Given 一个包含 3 个 case 的 suite, When 操作者发起 batch（2 个 version_set）, Then 系统创建 6 个 workflow_run 且 batch 状态为 running
- [ ] Given 一个 batch 中所有 6 个 workflow_run 完成, When 查询 batch 详情, Then 返回 3×2 的 scorecard 对比结果且 batch 状态为 completed
- [ ] Given 一个已完成的 workflow_run, When 操作者执行"转为 benchmark", Then 创建一个 benchmark_case 其 input 与原 workflow_run 一致
- [ ] Given batch 中某个 workflow_run 失败, When 查询对比结果, Then 该单元格显示 failed 状态而非空白
- [ ] Given Dashboard 实验页面, When 操作者点击某个 batch, Then 看到完整的对比表格含底部均值行

## 异常与边界情况

| 场景 | 触发条件 | 预期行为 |
|------|----------|----------|
| suite 为空 | 发起 batch 时 suite 无 case | 返回 400 错误 |
| version_set 不存在 | batch 引用了无效 version_set_id | 返回 400 错误 |
| 部分 run 失败 | workflow_run 达到 permanently_failed | batch 仍可完成，对比表格中标记失败 |
| batch 中全部 run 失败 | 所有 workflow_run 失败 | batch 状态为 completed，表格全部标记失败 |

## 产品约束

- 不改变现有 workflow_run 的执行逻辑
- batch 执行复用现有 orchestrator → scheduler → worker 链路
- version_set 必须是已存在的记录

## 度量与成功标准

- 操作者能在 5 分钟内完成"创建 suite → 发起 batch → 查看对比"的完整闭环
- 对比结果能明确回答"配置 A 在哪些 case 上优于配置 B"
