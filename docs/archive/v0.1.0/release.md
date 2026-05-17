---
version: "v0.1.0"
date: 2026-05-17
retain_until: 2027-05-17
previous_version: ""
next_version: ""
---

# 版本发布：v0.1.0

## 版本摘要

AI SDLC Platform 首个里程碑版本。完成从零到可运行的双轨闭环：Orchestrator 编排 → Scheduler 调度 → Code Worker 执行 → Review Worker 审查 → Artifact 持久化 → Dashboard 可视化 → Scorecard 评估对比。

## Changelog

### Features

- 工作流编排状态机 + 任务自动推进 (需求: phase1-minimal-loop)
- Scheduler claim/lease/heartbeat/retry 调度 (需求: phase1-minimal-loop)
- Worker SDK 统一协议 + worker_attempt 生命周期 (需求: phase1-minimal-loop)
- Artifact 文件系统产物管理 (需求: phase1-minimal-loop)
- Observability 证据收集 + attempt_scorecard (需求: phase1-minimal-loop)
- Evaluation 基础评分 (需求: phase1-minimal-loop)
- Code Worker 真实 git 仓库操作 + codex/kiro 双 implementation (需求: phase2-real-worker)
- Review Worker 代码审查 + 报告生成 (需求: phase2-real-worker)
- PR 自动交付（gh CLI best-effort）(需求: phase2-real-worker)
- Dashboard 工作流列表/创建/详情 + Markdown 审查报告 (需求: phase2-dashboard)
- Scorecard 比较 API + Dashboard 对比视图 (需求: phase2-scorecard-compare)
- 支持按 workflow 选择 implementation（kiro/codex）

### Fixes

- 空仓库（无 commit）时给出清晰错误信息
- code step 始终 reset 到 baseCommit 避免旧 commit 残留
- gitDiff 使用 :(exclude) 语法替代 :! 前缀
- Ctrl+C 3 秒超时强制退出避免 shutdown 卡死
- Dashboard prose markdown 渲染 + typography 插件

### Misc

- 初始化 monorepo 骨架（pnpm workspaces）
- 架构文档 + 设计文档体系建立
- 数据库 Schema + 迁移 + 种子数据
- E2E 测试 + 集成测试框架

## 包含需求

| 需求 slug | 概述 | 变更类型 | 影响模块 |
|-----------|------|----------|----------|
| phase1-minimal-loop | 最小双轨闭环 | 新增 | orchestrator, scheduler, worker-sdk, artifact, observability, evaluation, workflow |
| phase2-real-worker | 真实 Code Worker 集成 | 新增 | code-worker, review-worker, runtime |
| phase2-dashboard | 基础 Dashboard | 新增 | dashboard, orchestrator(API) |
| phase2-scorecard-compare | Scorecard 比较 | 新增 | orchestrator(API), dashboard |

## 已知遗留

| 问题 | 影响 | 跟踪位置 |
|------|------|----------|
| 架构规则自动 lint 缺失 | 中 | `docs/active/tech-debt-tracker.md` TD-001 |
| insights 模块未实现 | 低 | `docs/active/tech-debt-tracker.md` TD-003 |

## 验证状态

- [x] 所有需求的 plan status = done
- [x] Changelog 已填写完整
- [x] pnpm typecheck 通过
- [x] pnpm build 通过
