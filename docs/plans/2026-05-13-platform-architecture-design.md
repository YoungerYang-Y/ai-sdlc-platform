# 平台架构设计

**主题：** AI SDLC 平台推荐架构

**范围：** 为当前 monorepo 骨架沉淀已确认的模块关系、端到端执行主路径，以及失败处理路径。

## 背景

当前仓库已经定义了 monorepo 目录布局和模块意图，但还没有实际实现代码或运行时配置。这个设计的目标，是在不改变现有目录边界的前提下，把高层意图收敛成一套可落地的架构。

## 设计摘要

平台分成四层：

- 控制面，负责编排、调度、产物管理和用户交互。
- 执行面，负责需求分析、代码修改和审查等专用 worker。
- 运行时层，负责 agent 执行和 sandbox 隔离。
- 基础设施层，负责持久化状态和部署依赖。

## 关键决策

### 1. 编排与执行分离

`apps/orchestrator` 应保持为协调者，而不是直接执行代码的地方。这样可以把工作流逻辑和 worker 工具细节解耦。

### 2. 明确调度边界

`packages/scheduler` 应独立负责队列、重试、优先级和并发控制，避免这些运行性问题侵入 workflow 逻辑。

### 3. 用 SDK 统一 worker 协议

所有 worker 都应通过 `packages/worker-sdk` 实现共享契约。这样即使 worker 职责不同，orchestrator 和 scheduler 仍只需要面对一种集成方式。

### 4. 用 `packages/runtime` 屏蔽运行时差异

worker 不应关心底层究竟是 OpenHands、本地 sandbox 还是其他执行引擎。运行时抽象层的职责就是让执行策略可替换。

### 5. 将产物与任务状态分开持久化

工作流状态和 artifact 负载在生命周期和存储方式上不同。PostgreSQL 适合保存状态和引用，artifact storage 适合保存日志、patch 包和报告。

### 6. 将人工介入作为一等路径

dashboard 不只是状态展示页面，也应是审批、重试和人工处理异常任务的入口。

## 主流程

推荐的 happy path 如下：

1. 用户通过 dashboard 提交任务。
2. orchestrator 创建工作流实例。
3. scheduler 将分析和规划派发给 `claude-worker`。
4. scheduler 将代码修改和验证派发给 `codex-worker`。
5. scheduler 将代码审查派发给 `review-worker`。
6. 系统持久化并索引所有产物。
7. orchestrator 汇总结果并返回 dashboard。

## 失败路径

系统将失败分为瞬时失败、确定性失败、高风险失败和未知失败。

- 瞬时失败走自动退避重试。
- 确定性失败可触发自动再规划。
- 高风险失败或重复失败需要人工介入。
- 所有失败路径都必须保留审计和调试证据。

## 交付物

已确认的架构图和说明文档保存在 [platform-architecture.md](/mnt/e/Codes/Yggdrasil-Labs/ai-sdlc-platform/docs/architecture/platform-architecture.md)。

## 验收标准

- 仓库在 `docs/` 下存在持久化的架构文档。
- 文档包含分层模块关系图。
- 文档包含端到端主路径图。
- 文档包含失败、重试和人工介入路径图。
- 文档与当前仓库目录结构一致，并补全为可落地的模块边界。
