# AI SDLC Platform

AI 驱动的软件开发生命周期平台，通过编排多个专用 Worker 自动化完成从需求到交付的全流程。

平台同时服务两类场景：
- **delivery mode**：面向真实业务需求的自动化交付（代码生成 → 验证 → 审查 → PR）
- **experiment mode**：面向 benchmark 和版本对比的持续调优

## 技术栈

- **语言**：TypeScript（全栈）
- **Web 框架**：Hono
- **数据库**：PostgreSQL
- **前端**：React + Tailwind CSS + Vite
- **运行时**：OpenHands + Sandbox（隔离执行）
- **包管理**：pnpm workspaces（Monorepo）
- **测试**：Vitest

## 项目结构

```
ai-sdlc-platform/
├── src/server.ts          # 进程入口（组合根）
├── apps/
│   ├── orchestrator/      # 工作流编排服务（Hono API）
│   └── dashboard/         # 监控和控制 Web UI（React）
├── packages/
│   ├── worker-sdk/        # 统一协议、类型定义
│   ├── scheduler/         # 任务调度（claim/lease/retry）
│   ├── workflow/          # 工作流定义与模板
│   ├── artifact/          # 产物存储（文件系统）
│   ├── runtime/           # 运行时抽象接口
│   ├── observability/     # 证据索引、时间线、聚合
│   ├── evaluation/        # 评分（规则 + LLM + 人工校准）
│   └── insights/          # 趋势与对比洞察（待实现）
├── workers/
│   ├── code-worker/       # 代码生成 + 验证（支持 codex/kiro implementation）
│   └── review-worker/     # 代码审查
├── runtimes/
│   ├── openhands/         # OpenHands 运行时集成
│   └── sandbox/           # 隔离执行环境
├── infra/
│   ├── postgres/          # 数据库 Schema + 迁移 + 种子
│   └── docker/            # Docker Compose 配置
└── artifacts/             # 产物输出目录（patch/log/review_report）
```

## 快速开始

```bash
# 1. 安装依赖
pnpm install

# 2. 启动开发环境（PostgreSQL + 迁移 + 种子数据）
./scripts/dev-setup.sh

# 3. 启动平台
npx tsx src/server.ts

# 4. 启动 Dashboard（另一个终端）
cd apps/dashboard && pnpm dev
```

## 开发命令

```bash
pnpm build        # 构建所有包
pnpm test         # 运行所有测试
pnpm test:e2e     # 端到端测试
pnpm typecheck    # 类型检查
pnpm lint         # 代码规范检查
```

## 核心对象模型

- **workflow_run** — 一次完整需求实现，由 orchestrator 编排
- **task_run** — workflow 中的阶段级任务（code / verify / review）
- **worker_attempt** — 某个 worker 对某个 task_run 的一次执行
- **version_set** — 运行绑定的版本快照（method_version + execution_version）

## 当前版本（v0.1.0）

已完成 Phase 1-2 核心功能：

- ✅ Orchestrator 工作流编排（状态机 + 任务推进）
- ✅ Scheduler 任务调度（claim/lease/heartbeat/retry）
- ✅ Code Worker（真实 git 仓库操作、codex/kiro 双 implementation）
- ✅ Review Worker（代码审查 + 报告生成）
- ✅ Artifact 产物管理（patch / log / review_report）
- ✅ Observability 观测（attempt 级证据收集 + scorecard）
- ✅ Dashboard（工作流列表/创建/详情 + Scorecard 对比视图）
- ✅ PR 自动交付（best-effort 通过 gh CLI）

## 许可证

MIT
