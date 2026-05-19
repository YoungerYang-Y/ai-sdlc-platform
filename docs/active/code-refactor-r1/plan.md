---
id: plan-code-refactor-r1
status: draft
owner: "evan"
tags: [refactor, code-quality]
created: 2026-05-19
updated: 2026-05-19
spec: spec-code-refactor-r1
design: design-code-refactor-r1
---

# 实施计划：代码审查与重构

## 目标

改善核心模块的职责分离和代码组织，消除重复代码，不改变任何公共 API 行为。

## 执行模式

parallel — 所有任务无交叉依赖，可并行执行。

## 任务清单

### T1: Orchestrator 拆分（P1）

**agent**: developer | **status**: pending

**范围**：`apps/orchestrator/src/`

1. 创建 `helpers.ts`：提取 `mapWorkflowRun(row): WorkflowRun` + `findFiles(dir): Promise<string[]>`（顶层 import node:path/fs）
2. 创建 `engine.ts`：提取 `createWorkflowRun`、`advanceWorkflow`、`findNextStep`、`handleTaskCompleted`、`handleTaskFailed`。通过闭包引用 `scheduler`（与当前 let scheduler 模式一致）
3. 创建 `routes/workflow.ts`：workflow CRUD + approve/reject（≤80 行）
4. 创建 `routes/scorecard.ts`：/scorecards/compare
5. 创建 `routes/artifacts.ts`：/artifacts/:type/:workflowId（使用 helpers.findFiles）
6. 创建 `routes/scheduler-api.ts`：/tasks/claim + /attempts/*
7. 重写 `index.ts`：组装 engine + 挂载所有 routes + start/stop（≤100 行）

**初始化顺序**：createOrchestrator → 创建 sql → 创建 engine（scheduler=null）→ start() 中创建 scheduler 并注入 engine

**验证**：`pnpm typecheck && pnpm -r --filter='!@ai-sdlc/scheduler' --filter='!@ai-sdlc/observability' run test`

---

### T2: Evaluation 职责分离（P2）

**agent**: developer | **status**: pending

**范围**：`packages/evaluation/src/`

1. 创建 `scorer.ts`：提取 `WEIGHT_SNAPSHOT`、`DimensionScores`、`computeRuleScores`
2. 创建 `aggregator.ts`：提取 `aggregateRunScorecard`、`advanceBatchStatus`
3. 简化 `index.ts`：仅保留 `createEvaluation`（job loop + start/stop），import scorer 和 aggregator

**验证**：`pnpm -r --filter='@ai-sdlc/evaluation' run typecheck`

---

### T3: Code Worker handler 拆分（P2）

**agent**: developer | **status**: pending

**范围**：`workers/code-worker/src/`

1. 创建 `git-utils.ts`：提取 `gitDiff`、`execOutput`、`execVoid`、`DIFF_EXCLUDE`
2. 创建 `handlers/mock.ts`、`handlers/code.ts`、`handlers/verify.ts`
3. 创建 `handler.ts`：路由分发（import handlers）
4. 简化 `index.ts`：仅保留 entrypoint（env 解析 + worker 创建 + isMain）（≤60 行）

**验证**：`pnpm -r --filter='@ai-sdlc/code-worker' run typecheck && pnpm -r --filter='@ai-sdlc/code-worker' run test`

---

### T4: Dashboard 错误处理（P2）

**agent**: developer | **status**: pending

**范围**：`apps/dashboard/src/pages/`

- BatchList.tsx：fetch 添加 .catch + error state
- WorkflowList.tsx：同上

**验证**：`pnpm -r --filter='@ai-sdlc/dashboard' run typecheck`

---

## 依赖关系

```
T1（独立）
T2（独立）
T3（独立）
T4（独立）
```

## 执行策略

- P1 提交：T1（orchestrator 拆分）
- P2 提交：T2 + T3 + T4

## 回滚方案

纯重构，每次提交为原子单元。若引入回归：
- `git revert <commit>` 回退对应提交
- 无数据迁移、无 schema 变更，回退零成本

## 风险与阻塞

| 风险 | 影响 | 缓解 |
|------|------|------|
| 拆分后循环 import | typecheck 报错 | 设计中已明确依赖方向（engine→scheduler 闭包） |
| 集成测试依赖 app.request | 路由挂载顺序变化可能影响 | 拆分后立即运行测试验证 |
| export 签名变化 | 上游 server.ts 编译失败 | createOrchestrator 签名不变 |

## 完成标准

- `pnpm typecheck` 14/14 通过
- `pnpm -r --filter='!@ai-sdlc/scheduler' --filter='!@ai-sdlc/observability' run test` 全绿
- orchestrator/src/index.ts ≤ 100 行
- code-worker/src/index.ts ≤ 60 行
- 行数约束为指导性人工检查项，不添加 lint max-lines 规则

## 决策日志

| 决策 | 理由 |
|------|------|
| routes/workflow.ts 拆出 scorecard.ts + artifacts.ts | 避免新文件也膨胀到 200 行 |
| engine 通过闭包引用 scheduler | 与当前 `let scheduler` 模式一致，无循环依赖 |
| code-worker index.ts ≤ 60 行（非 40） | 入口需 import + env + worker + signal + isMain，40 行过紧 |
| 不加 eslint max-lines | 维护成本高于收益，人工检查足够 |
