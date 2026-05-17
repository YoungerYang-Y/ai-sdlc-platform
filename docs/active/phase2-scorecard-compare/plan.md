---
id: plan-phase2-scorecard-compare
status: done
owner: "evan"
tags: [phase2, experiment, scorecard]
created: 2026-05-17
updated: 2026-05-17
---

# 计划：Scorecard 比较

## 目标

实现 scorecard 比较 API 和 Dashboard 对比视图，让操作者能选择两个 workflow 并排查看评分差异。

## 执行模式

模式：sequential

## 任务列表

### T1: 后端 GET /scorecards/compare API
- depends_on: []
- scope: `apps/orchestrator/src/index.ts`
- verify: `cd apps/orchestrator && pnpm typecheck`
- agent: main
- status: done
- deliverable: 比较 API 端点

逻辑：
- 接收 query params `a` 和 `b`（workflowId）
- 对每个 workflowId：查 worker_attempts → 取最新 completed attempt → 查 attempt_scorecards + attempt_scorecard_revisions → 查 attempt_summary_reports
- 返回 `{ a: {...}, b: {...} }` 结构

### T2: Dashboard API 客户端 + 路由
- depends_on: [T1]
- scope: `apps/dashboard/src/api.ts`, `apps/dashboard/src/main.tsx`
- verify: `cd apps/dashboard && pnpm typecheck`
- agent: main
- status: done
- deliverable: fetchCompare 函数 + /compare 路由注册

### T3: CompareView 页面
- depends_on: [T2]
- scope: `apps/dashboard/src/pages/CompareView.tsx`
- verify: `cd apps/dashboard && pnpm typecheck`
- agent: main
- status: done
- deliverable: 并排对比视图（workflow info + 维度评分条 + 总分 + 胜出标识）

### T4: WorkflowList 增加对比入口
- depends_on: [T3]
- scope: `apps/dashboard/src/pages/WorkflowList.tsx`
- verify: `cd apps/dashboard && pnpm typecheck`
- agent: main
- status: done
- deliverable: 复选框 + "对比"按钮，选中 2 个后跳转 /compare?a=x&b=y

### T5: 验证
- depends_on: [T4]
- scope: 全局
- verify: `pnpm typecheck && pnpm --filter @ai-sdlc/dashboard build`
- agent: main
- status: done
- deliverable: typecheck + build 通过，手动验证对比功能

## 决策日志

## 风险与阻塞

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| workflow 无 scorecard（还在 running） | 低 | API 返回 null，前端显示占位 |

## 完成标准

- [x] 所有任务 status = done
- [x] `pnpm typecheck` 全通过
- [x] `pnpm --filter @ai-sdlc/dashboard build` 成功
- [x] 手动验证：两个 completed workflow 的 scorecard 对比正确展示
