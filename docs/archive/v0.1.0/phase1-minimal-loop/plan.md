---
id: plan-phase1-minimal-loop
status: completed
owner: "evan"
tags: [phase1, delivery, experiment, core]
created: 2026-05-16
updated: 2026-05-17
---

# 计划：Phase 1 最小双轨闭环实现

## 目标

实现平台第一个端到端闭环：从 API 提交需求 → Orchestrator 编排 → Scheduler 调度 → Worker 执行 CLI → 产物存储 → 观测记录 → 基础评分。交付侧能真实跑业务，实验侧能记录和对比。

## 执行模式

模式：mixed（T1-T4 按序，T5-T7 可并行，T8-T9 按序收尾）

## 任务列表

### T1: 基础设施搭建
- depends_on: []
- scope: `infra/postgres/`, `package.json`, `tsconfig.json`
- verify: `pnpm install && pnpm typecheck`
- agent: main
- status: done
- deliverable: 可编译的 monorepo + 数据库迁移脚本 + 开发用 docker-compose（PostgreSQL）

工作内容：
1. 根目录 tsconfig.json（base config + project references）
2. 各模块 tsconfig.json
3. `infra/postgres/migrations/001_initial_schema.sql`（完整 DDL）
4. `infra/docker/docker-compose.dev.yml`（PostgreSQL 服务）
5. `scripts/migrate.sh`（执行迁移）
6. 验证 `pnpm install && pnpm typecheck` 通过

### T2: Worker SDK 实现
- depends_on: [T1]
- scope: `packages/worker-sdk/src/`
- verify: `pnpm --filter @ai-sdlc/worker-sdk test`
- agent: main
- status: done
- deliverable: 可导入的 Worker SDK 包，含类型定义 + createWorker 框架 + 测试辅助

工作内容：
1. 类型定义（execution、observability、identity、version、interfaces）
2. SchedulerClient（HTTP 轮询实现）
3. ObservabilityClient（HTTP 批量上报）
4. LeaseManager（自动 heartbeat + AbortSignal）
5. EvidenceCollector（缓冲 + 批量 flush）
6. createWorker 工厂函数 + WorkerLoop
7. 测试辅助（createTestContext、InMemory mocks）
8. 单元测试

### T3: Artifact 包实现
- depends_on: [T1]
- scope: `packages/artifact/src/`
- verify: `pnpm --filter @ai-sdlc/artifact test`
- agent: subagent-1
- status: done
- deliverable: ArtifactStore 接口 + 文件系统后端 + 元数据索引

工作内容：
1. ArtifactStore 接口定义
2. FileSystemBackend（write/read/delete）
3. PostgreSQL 元数据索引（artifacts 表 CRUD）
4. 单元测试

### T4: Runtime 包实现
- depends_on: [T1]
- scope: `packages/runtime/src/`
- verify: `pnpm --filter @ai-sdlc/runtime test`
- agent: subagent-2
- status: done
- deliverable: Runtime 接口 + CliRuntime 适配器

工作内容：
1. Runtime / RuntimeSession 接口定义
2. CliRuntime（spawn 子进程、超时管理、AbortSignal 传播）
3. RuntimeRegistry（注册 + 查找适配器）
4. 单元测试（mock 子进程）

### T5: Scheduler 实现
- depends_on: [T2]
- scope: `packages/scheduler/src/`
- verify: `pnpm --filter @ai-sdlc/scheduler test`
- agent: main
- status: done
- deliverable: Scheduler 库（CommandService + QueryService + LeaseScanner + HTTP Router）

工作内容：
1. SchedulerRepository（PostgreSQL 查询：claim、update status、find expired）
2. CommandService（submit、claim、complete、fail、cancel）
3. QueryService（getStatus、listByWorkflow）
4. LeaseScanner（定时过期扫描）
5. HTTP Router（面向 Worker 的 REST API）
6. createScheduler 工厂函数
7. 单元测试（mock repository）+ 集成测试（真实 DB）

### T6: Workflow 包实现
- depends_on: [T2]
- scope: `packages/workflow/src/`
- verify: `pnpm --filter @ai-sdlc/workflow test`
- agent: subagent-1
- status: done
- deliverable: WorkflowDefinition 类型 + getDefaultWorkflow()

工作内容：
1. 类型定义（WorkflowDefinition、StepDefinition、FailureStrategy）
2. 默认模板（code → verify → review）
3. getDefaultWorkflow() 导出
4. 单元测试

### T7: Observability 实现
- depends_on: [T2, T3]
- scope: `packages/observability/src/`
- verify: `pnpm --filter @ai-sdlc/observability test`
- agent: subagent-2
- status: done
- deliverable: Observability 服务（EvidenceIngester + 状态机 + OrphanReaper + EvalTrigger）

工作内容：
1. EvidenceIngester（去重 + 入库 + 大载荷外置）
2. ObsStateMachine（状态转移逻辑）
3. OrphanReaper（定时扫描）
4. EvalTrigger（写入 pending_eval_jobs）
5. Aggregator（checkpoint_digest 生成）
6. HTTP API Router
7. 单元测试 + 集成测试

### T8: Orchestrator 实现
- depends_on: [T5, T6, T3]
- scope: `apps/orchestrator/src/`
- verify: `pnpm --filter @ai-sdlc/orchestrator test`
- agent: main
- status: done
- deliverable: Orchestrator HTTP 服务（WorkflowEngine + StateMachine + CallbackHandler）

工作内容：
1. WorkflowEngine（createWorkflow、findNextSteps、handleTaskEvent）
2. StateMachine（workflow_run 状态转移）
3. CallbackHandler（接收 Scheduler 事件、幂等处理）
4. HTTP API（/workflows CRUD + /callbacks/task-event）
5. Scheduler 嵌入（createScheduler 集成到同进程）
6. 启动脚本（HTTP 服务 + Scheduler start）
7. 集成测试

### T9: Workers 实现
- depends_on: [T2, T3, T4]
- scope: `workers/code-worker/src/`, `workers/review-worker/src/`
- verify: `pnpm --filter @ai-sdlc/code-worker test && pnpm --filter @ai-sdlc/review-worker test`
- agent: main
- status: done
- deliverable: 可运行的 Code Worker + Review Worker 进程

工作内容：
1. Code Worker handler（上下文组装 + 调用 CLI + 保存 patch + 上报证据）
2. Review Worker handler（加载 patch + 调用 CLI + 保存报告 + 上报证据）
3. 上下文工程共享模块（SkillLoader、HarnessLoader、WorkspaceInjector）
4. Worker 启动脚本（createWorker + config）
5. 单元测试（mock runtime + artifact）

### T10: 端到端集成验证
- depends_on: [T7, T8, T9]
- scope: 全部
- verify: `scripts/e2e-test.sh`
- agent: main
- status: done
- deliverable: 通过的端到端测试 + 基础 rule score 生成

工作内容：
1. 编写 e2e 测试脚本（启动服务 → 提交任务 → 等待完成 → 验证产物和 scorecard）
2. 基础 rule score 实现（`packages/evaluation/src/rule-scorer.ts`）
3. 修复集成问题
4. 验证双轨闭环：交付完成 + scorecard 生成

## 决策日志

| 日期 | 决策 | 理由 |
|------|------|------|
| 2026-05-16 | 按依赖链自底向上实现 | 避免 mock 过多，每层完成后上层可真实集成 |
| 2026-05-16 | T3/T4/T6/T7 可并行 | 与主线无共享状态，接口已锁定 |

## 风险与阻塞

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| CLI 工具（codex/kiro）在开发环境不可用 | 高 | Runtime 层支持 mock CLI（echo 模式），开发测试不依赖真实 CLI |
| PostgreSQL 连接配置问题 | 低 | docker-compose 提供标准化本地环境 |
| 模块间接口不匹配 | 中 | 先实现 Worker SDK 类型层，其他模块 import 类型确保编译通过 |

## 完成标准

- [ ] 所有任务 status = done
- [ ] `pnpm build && pnpm test && pnpm typecheck` 全部通过
- [ ] 端到端测试通过（提交需求 → workflow completed → scorecard 生成）
- [ ] 相关 design-doc status 更新为 verified
- [ ] 剩余债务已记录到 `tech-debt-tracker.md`
