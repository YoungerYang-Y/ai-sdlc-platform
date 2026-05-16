---
id: scheduler
status: draft
owner: "evan"
tags: [scheduler, task-run, worker-attempt, lease, retry]
created: 2026-05-16
verified:
---

# Scheduler 调度设计

## 背景与动机

Scheduler 是 `task_run` 和 `worker_attempt` 生命周期的唯一 owner。它连接 Orchestrator（任务提交方）和 Worker（任务执行方），负责：

- 任务入队与状态管理
- Worker claim 分配与 lease 管理
- attempt 创建与过期回收
- 按失败类型的重试决策
- 任务完成/失败时通知 Orchestrator

Scheduler 不做编排决策、不承载观测负载、不管产物存储。

## 设计原则

1. **DB 是唯一真相来源**：所有状态持久化在 PostgreSQL，无内存队列。Phase 1 通过 `SELECT FOR UPDATE SKIP LOCKED` 实现轻量级队列语义。
2. **CQRS 接口语义**：公开 API 按 Command（submit/claim/complete/fail/cancel）和 Query（getStatus/listPending/listByWorkflow）分组。Phase 1 共享单一 Repository，Phase 2 可独立拆分读写实现。
3. **Phase 1 嵌入，Phase 2 可拆**：作为库嵌入 Orchestrator 进程，但接口设计为独立服务级别，未来可无痛拆出。
4. **attempt 由 Scheduler 创建**：Worker 不自行创建 attempt，保证生命周期一致性。
5. **重试是 Scheduler 的决策**：Worker 只报告 fail，Scheduler 根据 failureType 和剩余重试次数决定是否创建新 attempt。
6. **观测与执行故障域隔离**：Scheduler 的 claim/complete/expire 流程不依赖 Observability 可用性。

## 架构总览

### Scheduler 在系统中的位置

```mermaid
flowchart TB
    subgraph Orchestrator["apps/orchestrator 进程"]
        O["Orchestrator 编排逻辑"]
        S["Scheduler（库）"]
        API["HTTP Router"]
    end

    subgraph Workers["Worker 进程"]
        W1["Codex Worker"]
        W2["Review Worker"]
    end

    DB[(PostgreSQL)]

    O -->|"submitTask / cancelTask / query"| S
    S -->|"onTaskCompleted / onTaskFailed"| O
    W1 -->|"HTTP: claim/heartbeat/complete/fail"| API
    W2 -->|"HTTP: claim/heartbeat/complete/fail"| API
    API --> S
    S <--> DB
```

### 内部分层

```mermaid
flowchart TD
    subgraph API["API 层"]
        Router["HTTP Router<br/>面向 Worker"]
    end

    subgraph Service["Service 层"]
        CMD["CommandService<br/>submit / claim / complete / fail / cancel"]
        QRY["QueryService<br/>getStatus / listPending / listByWorkflow"]
        LS["LeaseScanner<br/>定时过期扫描"]
    end

    subgraph Repo["Repository 层"]
        R["SchedulerRepository<br/>PostgreSQL 查询"]
    end

    Router --> CMD
    Router --> QRY
    CMD --> R
    QRY --> R
    LS --> CMD
    R --> DB[(PostgreSQL)]
```

## 标准做法

### 1. 接口设计

#### Orchestrator 侧（进程内调用）

```ts
interface Scheduler {
  // Command
  submitTask(input: SubmitTaskInput): Promise<TaskRun>;
  cancelTask(taskRunId: string): Promise<void>;

  // Query
  getTaskStatus(taskRunId: string): Promise<TaskRun | null>;
  listTasksByWorkflow(workflowRunId: string): Promise<TaskRun[]>;

  // Lifecycle
  start(): Promise<void>;
  stop(): Promise<void>;

  // HTTP router（挂载到 Orchestrator 的 HTTP 服务）
  router: HttpRouter;
}

interface SubmitTaskInput {
  workflowRunId: string;
  taskType: TaskType;
  params?: Record<string, unknown>;
  priority?: number;  // 默认 0（normal），10=high，-10=low。Phase 1 忽略，预留
  maxAttempts?: number;
}
```

#### Worker 侧（HTTP API）

| 操作 | 方法 | 路径 | 说明 |
|------|------|------|------|
| Claim | POST | `/tasks/claim` | 获取匹配 taskType 的任务 |
| Heartbeat | POST | `/attempts/{attemptId}/heartbeat` | 续租 |
| Complete | POST | `/attempts/{attemptId}/complete` | 标记成功 |
| Fail | POST | `/attempts/{attemptId}/fail` | 标记失败 |

### 2. 状态机

#### task_run 状态机

```mermaid
stateDiagram-v2
    [*] --> ready: submitTask()
    ready --> claimed: claim（创建 attempt）
    claimed --> ready: attempt failed + 可重试
    claimed --> completed: attempt completed
    claimed --> permanently_failed: attempt failed + 不可重试/重试耗尽
    ready --> cancelled: cancelTask()
    claimed --> cancelled: cancelTask()
```

#### worker_attempt 状态机

```mermaid
stateDiagram-v2
    [*] --> claimed: claim 时创建
    claimed --> running: 首次 heartbeat
    running --> completed: complete()
    running --> failed: fail()
    running --> expired: lease 过期
    claimed --> expired: lease 过期（Worker 从未开始）
```

### 3. 核心流程

#### Claim

```ts
async function claim(req: ClaimRequest): Promise<ClaimResponse | null> {
  const taskRun = await repo.findAndLockReadyTask(req.supportedTaskTypes);
  if (!taskRun) return null;

  await repo.updateTaskStatus(taskRun.id, "claimed");

  const attempt = await repo.createAttempt({
    taskRunId: taskRun.id,
    workerId: req.workerId,
    implementation: req.implementation,
    versionSetId: req.versionSetId,
    status: "claimed",
    attemptNumber: taskRun.currentAttemptCount + 1,
    leaseToken: generateLeaseToken(),
    leaseExpiresAt: now() + config.leaseDefaultMs,
  });

  await repo.incrementAttemptCount(taskRun.id);

  return { taskRun, attempt, leaseToken: attempt.leaseToken, leaseDurationMs: config.leaseDefaultMs };
}
```

#### Fail + 重试决策

```ts
async function fail(req: FailRequest): Promise<void> {
  const attempt = await repo.findAttempt(req.attemptId);
  assertValidLease(attempt, req.leaseToken);

  await repo.updateAttemptStatus(attempt.id, "failed", {
    failureType: req.failureType,
    failureReason: req.failureReason,
  });

  const taskRun = await repo.findTaskRun(attempt.taskRunId);
  const shouldRetry = req.failureType !== "business_error"
    && req.failureType !== "cancelled"
    && taskRun.currentAttemptCount < taskRun.maxAttempts;

  if (shouldRetry) {
    await repo.updateTaskStatus(taskRun.id, "ready");
  } else {
    await repo.updateTaskStatus(taskRun.id, "permanently_failed");
    config.onTaskFailed(taskRun);
  }
}
```

#### Lease 过期扫描

```ts
// 每 leaseScanIntervalMs 执行
async function scanExpiredLeases(): Promise<void> {
  const expired = await repo.findExpiredAttempts();
  for (const attempt of expired) {
    await repo.updateAttemptStatus(attempt.id, "expired");
    await handleAttemptFailure(attempt, "timeout");
  }
}
```

### 4. 数据模型

数据模型以 `docs/design-docs/infra-postgres.md` 的 DDL 为权威来源。此处列出 Scheduler 关注的核心字段：

#### task_runs 关键字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | uuid PK | |
| `workflow_run_id` | uuid FK | |
| `task_type` | varchar(32) | code / verify / review |
| `status` | varchar(32) | ready / claimed / completed / permanently_failed / cancelled |
| `priority` | int | 默认 0，Phase 1 不使用 |
| `max_attempts` | int | 最大尝试次数 |
| `current_attempt_count` | int | 已尝试次数 |
| `timeout_ms` | int | lease 时长（毫秒） |
| `params` | jsonb | 任务参数 |

#### worker_attempts 关键字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | uuid PK | |
| `task_run_id` | uuid FK | |
| `worker_id` | varchar(128) | |
| `implementation` | varchar(32) | kiro / codex / claude-code / custom |
| `version_set_id` | uuid FK | |
| `status` | varchar(32) | claimed / running / completed / failed / expired |
| `attempt_number` | int | 第几次尝试 |
| `lease_token` | varchar(128) UNIQUE | |
| `lease_expires_at` | timestamptz | |
| `last_heartbeat_at` | timestamptz | |
| `was_orphaned` | boolean | |

#### Claim SQL

```sql
SELECT * FROM task_runs
WHERE status = 'ready'
  AND task_type = ANY($1)
ORDER BY priority DESC, created_at ASC
LIMIT 1
FOR UPDATE SKIP LOCKED;
```

### 5. 目录结构

```
packages/scheduler/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts
│   ├── types.ts
│   ├── api/
│   │   └── router.ts
│   ├── service/
│   │   ├── command-service.ts
│   │   ├── query-service.ts
│   │   └── lease-scanner.ts
│   ├── repository/
│   │   └── scheduler-repository.ts
│   └── create-scheduler.ts
└── tests/
```

### 6. 配置项

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `db` | DatabasePool | 必填 | PostgreSQL 连接池 |
| `leaseDefaultMs` | number | 300_000 (5min) | 默认 lease 时长 |
| `leaseScanIntervalMs` | number | 30_000 (30s) | 过期扫描间隔 |
| `defaultMaxAttempts` | number | 3 | 默认最大尝试次数（task 未指定时） |
| `onTaskCompleted` | callback | 必填 | 完成通知 |
| `onTaskFailed` | callback | 必填 | 最终失败通知 |

### 7. Phase 1 范围

| 包含 | 不包含（Phase 2+）|
|------|-------------------|
| DB-as-queue，`FOR UPDATE SKIP LOCKED` | Redis 热缓存层 |
| FIFO 排序 | 优先级排序 |
| 固定延迟重试 (30s) | 指数退避 |
| 定时 lease 扫描 | 实时过期通知 |
| 按 failureType 重试决策 | 自定义重试策略插件 |
| 嵌入 Orchestrator 进程 | 独立服务部署 |
| 回调通知 Orchestrator | HTTP webhook / 事件总线 |

> Phase 1 约束：Scheduler 嵌入 Orchestrator 进程，通过回调函数通知，无网络地址依赖。Phase 2 拆为独立服务时需引入服务发现或注册制 callback。

## 反模式

| 反模式 | 为什么禁止 |
|--------|-----------|
| 在 Scheduler 内维护内存队列 | 重启丢状态，DB 和内存双数据源一致性问题 |
| Worker 自己创建 attempt | 破坏 Scheduler 对 attempt 生命周期的独占管理 |
| Scheduler 承载观测负载（reasoning/tool payload） | 执行协议与观测协议分离，Scheduler 只管生命周期 |
| 在 claim 查询中不加 SKIP LOCKED | 多 Worker 并发时死锁或等待 |
| Scheduler 直接调用 Worker（推模式） | Worker 主动 pull 更简单可靠，Worker 控制自己的节奏 |
| 把重试决策放在 Worker 侧 | Worker 没有全局视角，Scheduler 掌握 attemptCount 和配置 |

## 适用范围

- `packages/scheduler`：本文档的主体实现
- `apps/orchestrator`：Scheduler 的宿主进程（Phase 1），调用 submitTask/cancelTask
- `packages/worker-sdk`：定义 Scheduler HTTP API 的请求/响应类型
- `infra/postgres`：task_runs 和 worker_attempts 表的 Schema

## 参考

- `ARCHITECTURE.md`
- `docs/design-docs/worker-sdk.md`
- `docs/design-docs/arch-dual-track-roadmap.md`
- `docs/design-docs/arch-attempt-observability-evaluation.md`
- `docs/design-docs/core-beliefs.md`
