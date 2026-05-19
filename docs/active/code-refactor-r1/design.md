---
id: design-code-refactor-r1
status: draft
owner: "evan"
tags: [refactor, code-quality]
created: 2026-05-19
verified:
---

# 设计文档：代码审查与重构

## 背景

orchestrator/index.ts 混合了 workflow engine、HTTP 路由和文件操作，300+ 行难以维护。evaluation 和 code-worker 存在类似的职责混合问题。

## 模块拆分设计

### Orchestrator 拆分

```
apps/orchestrator/src/
├── index.ts              # 组装层：创建 engine + 挂载 routes + start/stop（≤100行）
├── engine.ts             # workflow 状态机：create/advance/handleCompleted/handleFailed
├── helpers.ts            # mapWorkflowRun(row) + findFiles
├── routes/
│   ├── workflow.ts       # /workflows CRUD + /approve + /reject（≤80行）
│   ├── scorecard.ts      # /scorecards/compare
│   ├── artifacts.ts      # /artifacts/:type/:workflowId
│   ├── scheduler-api.ts  # /tasks/claim + /attempts/*
│   ├── benchmark.ts      # 已存在
│   └── experiment.ts     # 已存在
```

**模块职责**：

| 模块 | 职责 | 依赖 |
|------|------|------|
| index.ts | 组装 + 生命周期 | engine, 所有 routes |
| engine.ts | workflow 状态机推进 | sql, scheduler(延迟注入), config callbacks |
| helpers.ts | 纯函数/工具 | 无外部依赖 |
| routes/workflow.ts | workflow HTTP 接口 | sql, engine |
| routes/scorecard.ts | 评分比较查询 | sql |
| routes/artifacts.ts | 文件系统产物读取 | helpers.findFiles |
| routes/scheduler-api.ts | worker 通信接口 | scheduler |

**初始化顺序**：
1. `createOrchestrator(config)` 创建 sql 连接
2. 创建 engine（此时 scheduler 为 null）
3. `start()` 时创建 scheduler，注入 engine（engine 通过闭包获取 scheduler 引用）
4. 挂载所有 routes

**engine 与 scheduler 的依赖协调**：engine 内部 `submitTask` 通过闭包引用 scheduler 变量（与当前 `let scheduler: Scheduler` 模式一致），不产生循环依赖。

### Evaluation 拆分

```
packages/evaluation/src/
├── index.ts              # createEvaluation: job loop + start/stop
├── scorer.ts             # computeRuleScores + WEIGHT_SNAPSHOT + scoreAttempt
├── aggregator.ts         # aggregateRunScorecard + advanceBatchStatus
```

### Code Worker 拆分

```
workers/code-worker/src/
├── index.ts              # entrypoint: env 解析 + worker 创建 + isMain（≤60行）
├── handler.ts            # 路由分发到 handlers/*
├── handlers/mock.ts
├── handlers/code.ts
├── handlers/verify.ts
├── git-utils.ts          # gitDiff, execOutput, execVoid
```

### Dashboard 错误处理

- BatchList、WorkflowList 添加 `.catch` + error 状态展示
- 统一模式：`const [data, setData] = useState(); const [error, setError] = useState()`

## 约束

- 公共 API（createOrchestrator 签名、返回类型、app 暴露）不变
- 现有测试不修改断言逻辑即可通过
- 行数上限为指导性约束（人工检查），不添加 lint max-lines 规则（成本高于收益）

## 迁移与兼容

不适用——纯内部重构，无 schema/API/数据格式变更。

## 发布与回滚

不适用——重构不改变运行时行为，若引入 bug 通过 `git revert` 回退整个提交即可。

## 观测性

不适用——不引入新的可观测指标或日志格式。

## 异常处理

不适用——不引入新的错误路径。

## 备选方案

| 方案 | 优势 | 否决原因 |
|------|------|----------|
| 不做（保持现状） | 零风险，不花时间 | 300 行单文件持续膨胀，后续迭代成本递增；新增需求（Phase 3）将使 orchestrator 更难维护 |
| 仅提取 helpers（最小拆分） | 改动最小 | 职责混合问题未解决，engine 和路由仍耦合 |
| 当前方案（engine + routes 分离） | 职责清晰、文件可独立理解 | 需要较多文件移动 |

## 验证方式

- `pnpm typecheck`
- `pnpm -r --filter='!@ai-sdlc/scheduler' --filter='!@ai-sdlc/observability' run test`
