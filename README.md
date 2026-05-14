# AI SDLC 平台

基于 LangGraph、Voltagent 和 OpenHands 构建的 AI 驱动软件开发生命周期平台。

## 架构

```
ai-sdlc-platform/
├── apps/              # 应用服务
├── packages/          # 共享库
├── workers/           # 任务执行器
├── runtimes/          # 运行时环境
├── scripts/           # 工具脚本
└── infra/             # 基础设施配置
```

## 组件

### Apps（应用）
- **orchestrator** - 核心工作流编排服务 (TypeScript)
- **dashboard** - 监控和控制 Web UI (TypeScript)

### Packages（共享包）
- **workflow** - 工作流定义和执行
- **scheduler** - 任务调度和队列管理
- **artifact** - 构建产物管理
- **runtime** - 运行时环境抽象
- **worker-sdk** - Worker 开发 SDK

### Workers（执行器）
- **codex-worker** - 代码生成和分析 (Node/Python)
- **claude-worker** - Claude AI 集成 (Node)
- **review-worker** - 代码审查自动化 (Python)

### Runtimes（运行时）
- **openhands** - OpenHands 运行时集成 (Python)
- **sandbox** - 隔离执行沙箱 (Python)

## 技术栈

- **编排**: LangGraph, Voltagent
- **运行时**: OpenHands
- **语言**: TypeScript, Python, Node.js
- **数据库**: PostgreSQL
- **容器化**: Docker

## 快速开始

```bash
# 安装依赖
pnpm install

# 初始化基础设施
./scripts/workspace.sh

# 启动服务
pnpm dev
```

## 开发

这是一个使用 pnpm workspaces 管理的 monorepo。

```bash
# 运行特定应用
pnpm --filter orchestrator dev

# 运行特定 worker
pnpm --filter claude-worker dev

# 清理环境
./scripts/cleanup.sh
```

## 多期能力规划

平台按“双轨演进”推进：每一阶段同时交付一个更完整的业务闭环和实验闭环，而不是先做完整交付平台、再整体补实验平台。

### Phase 1 - Minimal Delivery + Minimal Experiment（当前优先）

**目标**：同时跑通最小业务链路和最小实验闭环

**交付侧**：
- 工作流编排（简单状态机）
- 任务调度（PostgreSQL + claim/lease/retry）
- Codex Worker（code + verify）
- Review Worker
- Runtime 抽象（OpenHands 集成）
- Artifact 存储（文件系统）

**实验侧**：
- `workflow_run / task_run / worker_attempt` 基础对象模型
- `version_set` 运行身份绑定（method + execution）
- 固定 benchmark 或 ad-hoc task 发起运行
- `worker_attempt` 级观测：context、reasoning、tool trace、token/cost、timing、artifact refs
- 基础 `attempt_scorecard`
- 同一 benchmark 下两个 `version_set` 的基础 compare

**时间线**：2-4 周

### Phase 2 - Robust Execution + Operator UX

**目标**：把第一期的可用闭环变成可持续操作的系统

**交付侧**：
- Claude Worker（analysis + plan）
- 更稳的调度：优先级、并发控制、回收策略增强
- 基础人工介入流程
- Dashboard 主操作视图

**实验侧**：
- Experiment Batch
- Benchmark 管理
- Attempt Review / Replay
- Task / Run 聚合评分
- 初步 Feedback Labeling

**时间线**：4-6 周

### Phase 3 - Full Evaluation & Optimization Loop

**目标**：把实验能力做成真正的优化平台

**新增能力**：
- Experiment Service 完整化
- Observability Service（结构化 evidence index）
- Evaluation Service（rule + LLM + human 混合评分）
- Calibration Queue
- Insights & Compare（趋势、性价比、版本对比）
- Method Tuning Workflow（回灌 skill / harness docs / worker / model）

**时间线**：6-8 周

### Phase 4 - Productionization

**目标**：支持生产环境和大规模使用

**新增能力**：
- 多租户、资源配额、权限管理
- Redis / 分布式队列
- 高可用（多实例、主从复制、对象存储）
- 性能优化（并发优化、缓存、池管理）
- 安全增强（API 认证、RBAC、审计日志）
- OpenTelemetry、告警与审计

**时间线**：8-10 周

## 许可证

MIT
