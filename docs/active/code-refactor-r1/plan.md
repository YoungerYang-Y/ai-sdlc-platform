---
id: plan-code-refactor-r1
status: draft
owner: "evan"
tags: [refactor, code-quality]
created: 2026-05-19
updated: 2026-05-19
---

# 实施计划：代码审查与重构

## 目标

改善核心模块的职责分离和代码组织，消除重复代码，不改变任何公共 API 行为。

## 审查发现

| # | 模块 | 问题 | 优先级 |
|---|------|------|--------|
| R1 | orchestrator/index.ts | 300+ 行，混合 workflow engine 和 HTTP 路由。DB row → WorkflowRun 映射重复 5 处 | P1 |
| R2 | orchestrator/index.ts | `findFiles` 内嵌在路由中，每次动态 import（`await import("node:path")`） | P1 |
| R3 | orchestrator/index.ts | `getScorecard` 内联在路由 handler 中 | P2 |
| R4 | evaluation/index.ts | 单文件 130+ 行承载评分 + run_scorecard 聚合 + batch 推进三个职责 | P2 |
| R5 | 全局 | orchestrator 无统一 `mapWorkflowRun` helper | P1 |
| R6 | code-worker/index.ts | 170+ 行单文件，handler + git 工具混在一起 | P2 |
| R7 | Dashboard pages | 无错误边界，fetch 失败时用户无反馈 | P2 |

## 任务清单

### T1: Orchestrator 拆分（P1 — R1+R2+R3+R5）

**目标**：index.ts 从 300 行降到 ~80 行。

**拆分结构**：

```
apps/orchestrator/src/
├── index.ts              # createOrchestrator: 组装 engine + routes + start/stop
├── engine.ts             # workflow engine: createWorkflowRun, advanceWorkflow, handleTaskCompleted/Failed
├── helpers.ts            # mapWorkflowRun(row) + findFiles（顶层 import）
├── routes/
│   ├── workflow.ts       # /workflows CRUD + /scorecards/compare + /artifacts + approve/reject
│   ├── scheduler-api.ts  # /tasks/claim + /attempts/*
│   ├── benchmark.ts      # 已存在
│   └── experiment.ts     # 已存在
```

**具体步骤**：
1. 创建 `helpers.ts`：提取 `mapWorkflowRun(row): WorkflowRun` + `findFiles(dir): string[]`（顶层 import node:path/fs）
2. 创建 `engine.ts`：提取 `createWorkflowRun`、`advanceWorkflow`、`findNextStep`、`handleTaskCompleted`、`handleTaskFailed`。导出为 `createWorkflowEngine(sql, scheduler, config)` 工厂
3. 创建 `routes/workflow.ts`：提取 workflow CRUD + scorecards/compare + artifacts + approve/reject
4. 创建 `routes/scheduler-api.ts`：提取 /tasks/claim + /attempts/*
5. 重写 `index.ts`：仅组装 engine + 挂载所有路由 + start/stop

**约束**：
- `createOrchestrator` 的公共签名和返回类型不变
- `app` 对外暴露不变（测试直接用 app.request）
- WorkflowRun 类型导出位置不变

**验证**：typecheck 通过、现有测试通过

---

### T2: Evaluation 职责分离（P2 — R4）

**拆分为**：

```
packages/evaluation/src/
├── index.ts              # createEvaluation: job processing + start/stop
├── scorer.ts             # computeRuleScores + WEIGHT_SNAPSHOT
├── aggregator.ts         # aggregateRunScorecard + advanceBatchStatus
```

**验证**：typecheck 通过

---

### T3: Code Worker handler 拆分（P2 — R6）

**拆分为**：

```
workers/code-worker/src/
├── index.ts              # entrypoint + worker 创建
├── handler.ts            # 路由到 mock/code/verify
├── handlers/mock.ts
├── handlers/code.ts
├── handlers/verify.ts
├── git-utils.ts          # gitDiff, execOutput, execVoid
```

**验证**：typecheck 通过、现有 code-worker 测试通过

---

### T4: Dashboard 错误处理（P2 — R7）

- BatchList/WorkflowList 的 fetch 添加 .catch + 错误状态展示
- 统一模式：loading → data / error 三态

**验证**：typecheck 通过

---

## 依赖关系

```
T1（独立）
T2（独立）
T3（独立）
T4（独立）
（全部可并行，无交叉依赖）
```

## 执行策略

- 分两次提交：
  1. P1 提交：T1（orchestrator 拆分）
  2. P2 提交：T2 + T3 + T4
- 每次提交前 typecheck + test 全绿

## 不做

- 不改变任何公共 API 行为
- 不引入新依赖
- 不修改测试逻辑（拆分后已有测试继续通过）
- 不改变文件的对外导出签名

## 完成标准

- `pnpm typecheck` 14/14 通过
- `pnpm test`（非 DB 部分）34/34 通过
- orchestrator/index.ts ≤ 100 行
- evaluation/index.ts ≤ 60 行
- code-worker/src/index.ts ≤ 40 行
