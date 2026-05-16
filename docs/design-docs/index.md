# 设计决策目录

项目级通用设计决策。每个文档定义一个跨功能的设计主题，智能体在相关领域编码前应先查阅。

## 架构级文档

| id | 主题 | status | owner | 适用范围 | 路径 |
|----|------|--------|-------|----------|------|
| `arch-dual-track-roadmap` | 双轨演进路线 | draft | evan | 路线图、核心对象模型、实验平台演进 | `arch-dual-track-roadmap.md` |
| `arch-attempt-observability-evaluation` | Worker Attempt 观测与评估架构 | draft | evan | attempt 协议、观测状态机、评分与标签传播 | `arch-attempt-observability-evaluation.md` |

## 模块设计文档

| id | 模块 | 深度 | status | 路径 |
|----|------|------|--------|------|
| `artifact` | packages/artifact | 轻量 | draft | `artifact.md` |
| `runtime` | packages/runtime | 轻量 | draft | `runtime.md` |
| `worker-sdk` | packages/worker-sdk | 深度 | draft | `worker-sdk.md` |
| `workflow` | packages/workflow | 轻量 | draft | `workflow.md` |
| `scheduler` | packages/scheduler | 深度 | draft | `scheduler.md` |
| `orchestrator` | apps/orchestrator | 深度 | draft | `orchestrator.md` |
| `observability` | packages/observability | 深度 | draft | `observability.md` |
| `workers` | workers/* | 轻量 | draft | `workers.md` |
| `infra-postgres` | infra/postgres | 完整 DDL | draft | `infra-postgres.md` |

## 接口依赖矩阵

下表列出各模块导出的关键接口及其消费者：

| 导出模块 | 导出接口 | 消费者 |
|----------|----------|--------|
| `worker-sdk` | `TaskType`, `WorkerRole`, `WorkerImplementation` | workflow, scheduler, workers, observability |
| `worker-sdk` | `TaskRun`, `WorkerAttempt` (类型) | scheduler, orchestrator, observability |
| `worker-sdk` | `createWorker`, `SchedulerClient`, `LeaseManager`, `EvidenceCollector` | workers |
| `worker-sdk` | `Logger`, `ObservabilityReporter`, `TelemetryProvider` | workers, scheduler, orchestrator, observability |
| `worker-sdk` | `AttemptEvidenceEvent`, `AttemptSummaryReport` | observability |
| `workflow` | `WorkflowDefinition`, `StepDefinition`, `FailureStrategy` | orchestrator |
| `workflow` | `getDefaultWorkflow()`, `getWorkflow(id)` | orchestrator |
| `artifact` | `ArtifactStore` (interface) | workers, observability, orchestrator, evaluation |
| `runtime` | `Runtime`, `RuntimeSession` (interface) | workers |
| `scheduler` | 进程内 API (Phase 1) / HTTP API (Phase 2): submit/cancel/query | orchestrator |
| `scheduler` | HTTP API: `/tasks/claim`, `/attempts/*` | workers (via SDK，始终走 HTTP) |
| `scheduler` | `SchedulerEvent` (callback payload) | orchestrator |
| `scheduler` | `attempt_finished` 通知 | observability |
| `orchestrator` | HTTP API: `/workflows` (create/query/cancel) | CLI / 外部调用者 |
| `orchestrator` | HTTP API: `/callbacks/task-event` | scheduler |
| `observability` | HTTP API: `/attempts/{id}/evidence`, `/attempts/{id}/summary` | workers (via SDK) |
| `observability` | HTTP API: `/attempts/{id}/finished` | scheduler |
| `observability` | HTTP API: `/attempts/{id}/status`, `/attempts/{id}/timeline` | evaluation, dashboard |
| `infra-postgres` | DDL schema (共享表结构) | 所有模块（读写各自领域的表） |

## status 含义

- **draft**：设计尚未落地。智能体可参考但需注意细节可能变化。
- **verified**：设计与实现一致。智能体应严格遵守。
- **stale**：实现已偏离设计。智能体不应信赖细节，需先更新。

## 何时创建 design-doc

- 需要修改 `ARCHITECTURE.md` 或 `core-beliefs.md` 中的长期约束时，先创建 `arch-` 前缀的 design-doc 作为架构 RFC
- 发现跨多个需求的通用设计问题时（如缓存策略、幂等设计、错误码规范）
- 实施过程中需要违反现有依赖方向或架构约束时，暂停实施，先创建架构 RFC

**不要用 design-doc 替代需求目录中的 design.md**——需求级的设计放在 `docs/active/{需求}/design.md`，项目级的通用决策放在这里。

## 如何添加

1. 复制 `_template.md` 为 `{主题名}.md`（架构 RFC 用 `arch-` 前缀）
2. 填写 frontmatter 和所有章节
3. 在上方目录表中添加条目
4. status 设为 draft；落地验证后更新为 verified
