---
id: tech-choices
status: draft
owner: "evan"
tags: [architecture, tech-choices, framework, evaluation]
created: 2026-05-16
verified:
---

# 技术选型决策

## 背景与动机

本文档记录平台核心技术选型的决策过程和理由，确保团队理解每个"不用什么"和"用什么"背后的逻辑。当外部框架演进或平台需求变化时，据此重新评估。

## 设计原则

1. **TypeScript 统一**：全栈 TypeScript，不为单一功能引入额外语言层
2. **自主可控优先**：核心编排和实验能力不绑定外部框架的演进节奏
3. **框架解决通用问题，know-how 自己做**：基础设施可以用成熟方案，但编排策略、上下文工程、实验闭环是平台核心价值，不外包
4. **引入即依赖**：每个外部依赖都增加理解成本和升级风险，必须有明确的不可替代理由

## 决策总览

| 领域 | 决策 | 评估过的替代方案 |
|------|------|------------------|
| Workflow 编排 | 自研 Orchestrator | LangGraph |
| Worker 内部编排 | 不引入 Agent 框架 | LangGraph、Voltagent |
| 执行隔离 | 宿主机直接执行 (Phase 1) / OpenHands Sandbox (Phase 2) | Docker-in-Docker、Firecracker |
| 任务队列 | PostgreSQL (DB-as-queue) | Redis、RabbitMQ |
| 通信模式 | HTTP 轮询 | WebSocket、gRPC |
| 包管理 | pnpm workspaces | npm workspaces、Turborepo |
| 数据库 | PostgreSQL | MongoDB、SQLite |

## 详细决策记录

### 1. Workflow 编排：自研 vs LangGraph

**决策：自研 TypeScript Orchestrator**

评估了 LangGraph 用于 workflow 编排（code → verify → review → deploy 等步骤流转）。

| 维度 | 自研 | LangGraph |
|------|------|-----------|
| 语言 | TypeScript ✅ | Python ⚠️ 需要额外服务 |
| 线性流程 | 简单 | 过重 |
| DAG / 循环反馈 | 需要自建 | 内置 |
| Human-in-the-loop | 自建（一个状态 + API） | 内置 Interrupts |
| Durable execution | DB 持久化 + 状态恢复 | 内置 Checkpoint |
| 实验体系集成 | 原生（version_set/attempt 深度耦合） | 需要适配层 |
| 可观测性 | 自建 observability | LangSmith（商业绑定） |

**选择自研的核心理由**：

1. Python 语言层与 TypeScript monorepo 有摩擦，引入 LangGraph 意味着一个 Python sidecar 或跨语言 HTTP 调用
2. 平台的实验体系（version_set、attempt 观测、scorecard）与 workflow 深度耦合，外部框架无法无缝集成
3. Human-in-the-loop 在自研架构中实现成本低（~200 行代码 + 一张表）
4. 当前 workflow 是确定性步骤流转，不需要 LLM 决定下一步做什么——这不是 Agent 图的典型场景

**重新评估触发条件**：

- TypeScript 版 LangGraph（langgraphjs）成熟度达到 Python 版水平
- Workflow 复杂度超过自研状态机可维护的上限（> 20 个步骤 + 复杂并行/循环）

### 2. Worker 内部编排：不引入 Agent 框架

**决策：Worker = 上下文工程 + 调 CLI，不引入 LangGraph / Voltagent**

评估了在 Worker handler 内部使用 Agent 框架来编排复杂推理链。

| 维度 | 不引入 | Voltagent | LangGraph |
|------|--------|-----------|-----------|
| 现成 CLI 调用 | 直接 spawn ✅ | 过重 | 过重 |
| 自研 Agent | 封装为 CLI 接入 ✅ | Supervisor 模式可用 | 图模式可用 |
| 上下文工程 | 自己控制 ✅ | 框架不帮你做 | 框架不帮你做 |
| 复杂度 | 最低 | 中 | 高 |

**选择不引入的核心理由**：

1. Worker 的核心挑战是**上下文工程**（选什么文件、拼什么 prompt、管理 token budget），这是 skill/harness docs 体系的职责，Agent 框架不解决这个问题
2. 现成 CLI（kiro/codex/claude-code）本身就是完整的 Agent，Worker 只需"喂上下文 + 调用 + 收结果"
3. 自研 Agent 会封装为 CLI，对 Worker SDK 来说与现成 CLI 无差别
4. Voltagent（TypeScript）是可选项，但 Phase 1 的 Worker 就是"调 CLI"，引入框架无收益

**重新评估触发条件**：

- 出现需要在 Worker 内部做多轮 LLM 推理 + 工具调用循环的场景，且无法封装为独立 CLI

### 3. 执行隔离：OpenHands Sandbox

**决策：Phase 2 引入 OpenHands 作为 sandbox 隔离执行环境**

Phase 1 Worker 直接在宿主机上调用 CLI（依赖宿主机已有的认证状态）。Phase 2 引入 OpenHands 提供：

- 隔离的文件系统（避免 Worker 间互相影响）
- 可控的执行环境（固定依赖版本）
- 安全边界（限制 CLI 的权限范围）

**CLI 认证问题的解决方案**：

| 阶段 | 方案 |
|------|------|
| Phase 1 | 宿主机认证，Worker 进程继承环境凭证 |
| Phase 2 | sandbox 启动时注入环境变量（API key），attempt 级短期令牌 |
| Phase 3+ | 认证代理网关，sandbox 内无明文 key |

### 4. Worker 命名规范

**决策：按角色命名，Implementation 是配置**

```
workers/
├── code-worker/      # 角色：code + verify
└── review-worker/    # 角色：review
```

- Worker 按 Role 组织代码库（不同角色的 handler 逻辑不同）
- 同一个 Worker 可切换不同 Implementation（kiro/codex/claude-code），通过启动配置决定
- 不为每个 CLI 工具建独立的 Worker 目录

### 5. 平台核心价值（不可外包给框架）

1. **编排策略**：全流程步骤拆分、反馈循环、human 审查点、失败恢复
2. **上下文工程**：给每个 Worker 最优输入（skill + harness docs + context selection + token budget）
3. **实验闭环**：version_set 对比、attempt 观测、scorecard 调优找最优解

## 反模式

| 反模式 | 为什么禁止 |
|--------|-----------|
| 为了用框架而用框架 | 框架引入的认知负担和依赖风险必须有明确收益覆盖 |
| 把上下文工程交给 Agent 框架 | skill/harness docs 是平台核心 know-how，必须自己控制 |
| 为每个 CLI 工具建独立 Worker | Worker 按角色组织，Implementation 是配置项 |
| 在 TypeScript 项目中引入 Python 进程 | 除非收益远大于运维成本（当前不满足） |

## 适用范围

- 所有技术选型和外部依赖引入决策
- 新 Worker 创建时的命名和组织方式
- 评估是否引入新框架时的检查清单

## 参考

- `docs/design-docs/core-beliefs.md`（信条 #6：偏好无聊的技术）
- `docs/design-docs/modules/worker-sdk.md`（Worker = Role × Implementation）
- `docs/design-docs/modules/workers.md`（Worker 通用设计）
- `ARCHITECTURE.md`
