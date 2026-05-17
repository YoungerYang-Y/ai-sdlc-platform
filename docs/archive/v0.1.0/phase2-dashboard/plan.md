---
id: plan-phase2-dashboard
status: in-progress
owner: "evan"
tags: [phase2, delivery, dashboard]
created: 2026-05-17
updated: 2026-05-17
---

# 计划：Phase 2 基础 Dashboard

## 目标

实现一个 React + Vite + Tailwind 的 Web 界面，让操作者能提交 Workflow、监控执行进度、查看 patch diff 和 review 报告。后端补充列表查询和产物读取 API。

## 执行模式

模式：sequential

后端 API 先行（前端依赖），然后前端按页面逐一实现。

## 任务列表

### T1: 后端 API 补充
- depends_on: []
- scope: `apps/orchestrator/src/index.ts`
- verify: `cd apps/orchestrator && pnpm typecheck`
- agent: main
- status: done
- deliverable: GET /workflows（列表精简字段）+ GET /artifacts/*（路径安全校验 + raw content）

### T2: Dashboard 项目脚手架
- depends_on: [T1]
- scope: `apps/dashboard/`
- verify: `cd apps/dashboard && pnpm dev`（能启动不报错）
- agent: main
- status: done
- deliverable: package.json, vite.config.ts, tsconfig.json, tailwind, postcss, index.html, main.tsx

### T3: API 客户端 + 共享组件
- depends_on: [T2]
- scope: `apps/dashboard/src/api.ts`, `apps/dashboard/src/components/`
- verify: `cd apps/dashboard && pnpm typecheck`
- agent: main
- status: todo
- deliverable: api.ts（fetch 封装）、StatusBadge、DiffViewer、MarkdownView

### T4: WorkflowList 页面
- depends_on: [T3]
- scope: `apps/dashboard/src/pages/WorkflowList.tsx`
- verify: `cd apps/dashboard && pnpm typecheck`
- agent: main
- status: todo
- deliverable: 列表表格 + 状态筛选 + 自动轮询

### T5: WorkflowCreate 页面
- depends_on: [T3]
- scope: `apps/dashboard/src/pages/WorkflowCreate.tsx`
- verify: `cd apps/dashboard && pnpm typecheck`
- agent: main
- status: todo
- deliverable: 表单（requirement, repository/workDir, branch, verifyCommand, triggerType）+ 提交 + 跳转

### T6: WorkflowDetail 页面
- depends_on: [T3]
- scope: `apps/dashboard/src/pages/WorkflowDetail.tsx`
- verify: `cd apps/dashboard && pnpm typecheck`
- agent: main
- status: todo
- deliverable: Header + TaskTimeline + DiffViewer + MarkdownView + 轮询刷新

### T7: 安装依赖 + 全量验证
- depends_on: [T4, T5, T6]
- scope: `apps/dashboard/`
- verify: `cd apps/dashboard && pnpm install && pnpm typecheck && pnpm build`
- agent: main
- status: todo
- deliverable: 构建产物 + 手动启动验证

## 决策日志

- 2026-05-17 — GET /workflows 列表只返回精简字段（id, status, trigger_type, created_at, finished_at, requirement 摘要）— 避免大 payload
- 2026-05-17 — GET /artifacts/* 使用 c.req.path 提取 ref — Hono wildcard 路由的正确用法
- 2026-05-17 — markdown 渲染使用 marked — API 稳定，35KB，不自实现

## 风险与阻塞

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| Tailwind + Vite 配置兼容性 | 低 | 使用标准模板配置 |
| marked 版本 API 变化 | 低 | 固定版本 |
| 后端 CORS 问题 | 低 | Vite proxy 绕过 |

## 完成标准

- [ ] 所有任务 status = done
- [ ] `pnpm typecheck` 全通过（含 orchestrator + dashboard）
- [ ] `pnpm --filter @ai-sdlc/dashboard build` 成功
- [ ] 手动启动验证：提交 workflow → 列表可见 → 详情页查看 patch + review
