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

## 许可证

MIT
