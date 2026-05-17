---
id: spec-phase2-scorecard-compare
status: draft
owner: "evan"
tags: [phase2, experiment, scorecard, comparison]
created: 2026-05-17
updated: 2026-05-17
---

# 产品规格：Scorecard 比较

## 问题与动机

Phase 1 验收标准 #7 要求"同一任务两个 version_set 的 scorecard 可比较"，当前数据结构支持但无查询入口和可视化。操作者无法回答"哪个配置更好"这个核心实验问题。

## 功能边界

### In Scope

- 比较 API：按 version_set 或 attempt ID 查询 scorecard 并排对比
- Dashboard 比较页面：选择两个 workflow/attempt，并排展示评分维度差异
- 支持从 workflow 列表直接发起对比

### Out of Scope

- 批量统计（多次运行的平均分）→ 后续 Experiment Batch
- 趋势图 → Phase 3
- 自动推荐最优 version_set → Phase 3

## 用户场景

### 场景 1：对比两个 workflow 的执行结果

1. 用户在列表页勾选两个 workflow（或在详情页点击"对比"）
2. 进入对比视图
3. 看到两者的 scorecard 维度分数（success / efficiency / cost）并排展示
4. 看到总分差异和各维度胜出标识

### 场景 2：同一需求不同 implementation 对比

1. 用户用 kiro 跑一次需求，用 codex 跑同一需求
2. 在对比页面选择这两个 workflow
3. 看到 implementation 标识 + 各维度评分对比
4. 判断哪个 implementation 更适合该类任务

## 输入与输出

### 用户输入

- 选择两个 workflow ID 或 attempt ID 进行对比

### 用户可见输出

- 两侧基本信息（implementation、status、duration）
- 各评分维度并排对比（数值 + 胜出高亮）
- 总分对比

## 验收标准

- [ ] Given 两个 completed 的 workflow, When 调用比较 API, Then 返回两者的 scorecard 数据
- [ ] Given 比较页面, When 选择两个 workflow, Then 并排显示评分维度
- [ ] Given 两个 scorecard, When 某维度一方更高, Then 该维度高亮胜出方
- [ ] Given 某 workflow 无 scorecard, When 发起比较, Then 显示"暂无评分"
- [ ] Given 列表页, When 选择两个 workflow 点击对比, Then 跳转到比较页面

## 异常与边界情况

| 场景 | 触发条件 | 预期行为 |
|------|----------|----------|
| workflow 还在 running | 无 scorecard | 显示"执行中，暂无评分" |
| 只选了一个 | 另一侧为空 | 提示"请选择第二个 workflow" |
| scorecard 不存在 | evaluation 未触发 | 显示"暂无评分数据" |

## 产品约束

- 对比单位是 workflow 级别（取该 workflow 下所有 attempt 的最优 scorecard）
- 不涉及数据库 schema 变更

## 度量

- 操作者使用对比功能频率 > 1 次/天
