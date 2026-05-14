# 平台架构实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将已文档化的 AI SDLC 平台架构落成 monorepo 的第一版可运行实现。

**Architecture:** 按“控制面优先”的顺序推进。先补共享契约和持久化，再实现编排与调度，然后在稳定接口之上接入 worker 和运行时集成。第一阶段保持范围收敛，只打通一条端到端主路径：一个 workflow、一种队列策略、一个可写 worker、一个审查 worker、一条 artifact 路径。

**Tech Stack:** TypeScript、pnpm workspaces、PostgreSQL、Docker、LangGraph、OpenHands、sandbox runtime

---

### Task 1: 建立 workspace 包清单

**Files:**
- Create: `package.json`
- Create: `apps/orchestrator/package.json`
- Create: `apps/dashboard/package.json`
- Create: `packages/workflow/package.json`
- Create: `packages/scheduler/package.json`
- Create: `packages/artifact/package.json`
- Create: `packages/runtime/package.json`
- Create: `packages/worker-sdk/package.json`
- Create: `workers/codex-worker/package.json`
- Create: `workers/claude-worker/package.json`
- Create: `workers/review-worker/package.json`

**Step 1: 创建根 workspace 清单**

创建根 `package.json`，提供共享的 `dev`、`build`、`lint`、`test` 脚本，并声明 `pnpm` workspace 用法。

**Step 2: 为每个 workspace 创建最小 package manifest**

为每个 workspace 提供 `name`、必要的 `private` 标记，以及占位的 `dev` 或 `build` 脚本。

**Step 3: 验证 workspace 发现结果**

Run: `source ~/.nvm/nvm.sh && pnpm -r list --depth -1`
Expected: 所有 workspace 包都能被识别，且没有 manifest 错误

**Step 4: 提交**

```bash
git add package.json apps packages workers
git commit -m "feat: initialize workspace manifests"
```

### Task 2: 定义共享任务与 worker 契约

**Files:**
- Create: `packages/worker-sdk/src/contracts.ts`
- Create: `packages/worker-sdk/src/index.ts`
- Create: `packages/workflow/src/types.ts`
- Create: `packages/artifact/src/types.ts`
- Test: `packages/worker-sdk/src/contracts.test.ts`

**Step 1: 先写失败的契约测试**

为任务载荷结构、worker 结果结构、artifact 引用结构和失败分类结构定义测试。

**Step 2: 运行测试，确认先失败**

Run: `source ~/.nvm/nvm.sh && pnpm --filter worker-sdk test`
Expected: FAIL，因为源码文件尚不存在

**Step 3: 实现最小共享契约**

补充任务标识、执行上下文、artifact 引用、重试元数据和 worker 输出的 TypeScript 类型或 schema。

**Step 4: 再次运行测试，确认通过**

Run: `source ~/.nvm/nvm.sh && pnpm --filter worker-sdk test`
Expected: PASS

**Step 5: 提交**

```bash
git add packages/worker-sdk packages/workflow packages/artifact
git commit -m "feat: add shared task and worker contracts"
```

### Task 3: 补充 workflow 与 artifact 的持久化 schema

**Files:**
- Create: `infra/postgres/schema.sql`
- Create: `infra/postgres/README.md`
- Test: `infra/postgres/schema-review.md`

**Step 1: 起草 schema**

创建 `workflow_runs`、`workflow_tasks`、`artifacts`、`task_events` 和 `human_interventions` 等表。

**Step 2: 按架构状态字段审查 schema**

确认 schema 能存储 `status`、`retry_count`、`failure_type`、`failure_reason`、`human_action_required`、`last_artifact_id` 和 `resolution_note`。

**Step 3: 验证内部一致性**

Run: `rg "workflow_runs|workflow_tasks|artifacts|task_events|human_interventions" infra/postgres/schema.sql`
Expected: schema 中包含所有核心表

**Step 4: 提交**

```bash
git add infra/postgres
git commit -m "feat: add workflow persistence schema"
```

### Task 4: 搭建 orchestrator 骨架

**Files:**
- Create: `apps/orchestrator/src/index.ts`
- Create: `apps/orchestrator/src/orchestrator.ts`
- Create: `apps/orchestrator/src/workflow-factory.ts`
- Test: `apps/orchestrator/src/orchestrator.test.ts`

**Step 1: 先写失败的 orchestrator 测试**

测试“提交请求后会生成 workflow 实例，并产生初始持久化状态与首批任务”。

**Step 2: 运行测试，确认先失败**

Run: `source ~/.nvm/nvm.sh && pnpm --filter orchestrator test`
Expected: FAIL，因为 orchestrator 实现尚不存在

**Step 3: 实现最小 orchestrator**

实现一个轻量服务，负责接收输入、调用 workflow 构建逻辑，并将可执行任务交给 scheduler 边界。

**Step 4: 再次运行测试，确认通过**

Run: `source ~/.nvm/nvm.sh && pnpm --filter orchestrator test`
Expected: PASS

**Step 5: 提交**

```bash
git add apps/orchestrator
git commit -m "feat: scaffold orchestrator core flow"
```

### Task 5: 搭建 scheduler 骨架

**Files:**
- Create: `packages/scheduler/src/index.ts`
- Create: `packages/scheduler/src/scheduler.ts`
- Create: `packages/scheduler/src/retry-policy.ts`
- Test: `packages/scheduler/src/scheduler.test.ts`

**Step 1: 先写失败的 scheduler 测试**

覆盖入队、派发、重试分类，以及瞬时失败的退避行为。

**Step 2: 运行测试，确认先失败**

Run: `source ~/.nvm/nvm.sh && pnpm --filter scheduler test`
Expected: FAIL，因为 scheduler 尚未实现

**Step 3: 实现最小调度行为**

先以可用为目标，加入内存队列和显式重试策略。

**Step 4: 再次运行测试，确认通过**

Run: `source ~/.nvm/nvm.sh && pnpm --filter scheduler test`
Expected: PASS

**Step 5: 提交**

```bash
git add packages/scheduler
git commit -m "feat: add initial scheduler behavior"
```

### Task 6: 增加 artifact 持久化与报告能力

**Files:**
- Create: `packages/artifact/src/store.ts`
- Create: `packages/artifact/src/index.ts`
- Test: `packages/artifact/src/store.test.ts`

**Step 1: 先写失败的 artifact 测试**

覆盖日志、patch 包和审查报告的存储，以及对应元数据引用。

**Step 2: 运行测试，确认先失败**

Run: `source ~/.nvm/nvm.sh && pnpm --filter artifact test`
Expected: FAIL，因为 artifact store 尚不存在

**Step 3: 实现最小 artifact store**

通过一个简单的 repository 抽象保存元数据，并为实际负载预留基于文件的存储位置。

**Step 4: 再次运行测试，确认通过**

Run: `source ~/.nvm/nvm.sh && pnpm --filter artifact test`
Expected: PASS

**Step 5: 提交**

```bash
git add packages/artifact
git commit -m "feat: add artifact storage abstraction"
```

### Task 7: 增加运行时抽象与 sandbox 契约

**Files:**
- Create: `packages/runtime/src/index.ts`
- Create: `packages/runtime/src/runtime.ts`
- Create: `runtimes/sandbox/README.md`
- Create: `runtimes/openhands/README.md`
- Test: `packages/runtime/src/runtime.test.ts`

**Step 1: 先写失败的 runtime 测试**

覆盖环境准备、命令执行请求结构和结果归一化。

**Step 2: 运行测试，确认先失败**

Run: `source ~/.nvm/nvm.sh && pnpm --filter runtime test`
Expected: FAIL，因为 runtime 抽象尚未存在

**Step 3: 实现最小 runtime 接口**

定义运行时适配器契约，并先提供一个 sandbox 驱动的实现桩。

**Step 4: 再次运行测试，确认通过**

Run: `source ~/.nvm/nvm.sh && pnpm --filter runtime test`
Expected: PASS

**Step 5: 提交**

```bash
git add packages/runtime runtimes
git commit -m "feat: add runtime abstraction contract"
```

### Task 8: 基于共享 SDK 搭建 worker 骨架

**Files:**
- Create: `workers/claude-worker/src/index.ts`
- Create: `workers/codex-worker/src/index.ts`
- Create: `workers/review-worker/src/index.ts`
- Test: `workers/codex-worker/src/index.test.ts`
- Test: `workers/review-worker/src/index.test.ts`

**Step 1: 先写失败的 worker 测试**

验证每个 worker 都能接收共享任务契约，并输出共享结果契约。

**Step 2: 运行测试，确认先失败**

Run: `source ~/.nvm/nvm.sh && pnpm --filter "./workers/*" test`
Expected: FAIL，因为 worker 入口文件尚不存在

**Step 3: 实现最小 worker 桩**

为分析、代码生成和审查添加占位处理器，并返回确定性的 mock 结果。

**Step 4: 再次运行测试，确认通过**

Run: `source ~/.nvm/nvm.sh && pnpm --filter "./workers/*" test`
Expected: PASS

**Step 5: 提交**

```bash
git add workers
git commit -m "feat: scaffold worker implementations"
```

### Task 9: 打通一条完整的端到端链路

**Files:**
- Modify: `apps/orchestrator/src/orchestrator.ts`
- Modify: `packages/scheduler/src/scheduler.ts`
- Modify: `packages/artifact/src/store.ts`
- Modify: `workers/claude-worker/src/index.ts`
- Modify: `workers/codex-worker/src/index.ts`
- Modify: `workers/review-worker/src/index.ts`
- Test: `apps/orchestrator/src/e2e.test.ts`

**Step 1: 先写失败的端到端测试**

模拟一个请求，覆盖分析、计划、代码修改、验证和审查任务，并最终产出 artifact 引用。

**Step 2: 运行测试，确认先失败**

Run: `source ~/.nvm/nvm.sh && pnpm --filter orchestrator test -- e2e`
Expected: FAIL，因为各组件尚未真正连通

**Step 3: 实现最薄的集成路径**

将 orchestrator、scheduler、workers、runtime 和 artifact store 串起来，先支持一条线性 workflow。

**Step 4: 再次运行测试，确认通过**

Run: `source ~/.nvm/nvm.sh && pnpm --filter orchestrator test -- e2e`
Expected: PASS

**Step 5: 提交**

```bash
git add apps/orchestrator packages workers
git commit -m "feat: wire initial end-to-end execution flow"
```

### Task 10: 为 workflow 状态增加 dashboard 可视化

**Files:**
- Create: `apps/dashboard/src/app.tsx`
- Create: `apps/dashboard/src/workflow-run-view.tsx`
- Test: `apps/dashboard/src/workflow-run-view.test.tsx`

**Step 1: 先写失败的 dashboard 测试**

验证 workflow run 视图能够展示节点状态、重试次数和是否需要人工介入。

**Step 2: 运行测试，确认先失败**

Run: `source ~/.nvm/nvm.sh && pnpm --filter dashboard test`
Expected: FAIL，因为 dashboard UI 文件尚不存在

**Step 3: 实现最小状态视图**

使用 mock 数据或第一版 orchestrator 读取接口，渲染 workflow run 和 task state。

**Step 4: 再次运行测试，确认通过**

Run: `source ~/.nvm/nvm.sh && pnpm --filter dashboard test`
Expected: PASS

**Step 5: 提交**

```bash
git add apps/dashboard
git commit -m "feat: add workflow status dashboard"
```

## 验证清单

- `source ~/.nvm/nvm.sh && pnpm -r list --depth -1`
- `source ~/.nvm/nvm.sh && pnpm --filter worker-sdk test`
- `source ~/.nvm/nvm.sh && pnpm --filter scheduler test`
- `source ~/.nvm/nvm.sh && pnpm --filter orchestrator test`
- `source ~/.nvm/nvm.sh && pnpm --filter "./workers/*" test`

## 备注

- 第一版实现保持线性流程，不要在端到端主路径稳定前引入多分支 workflow。
- 优先使用内存或本地适配器，等接口稳定后再引入真正的网络基础设施。
- 除非实现过程中明确发现目录划分不合理，否则保持当前仓库边界不变。
