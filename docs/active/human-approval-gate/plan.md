---
id: plan-human-approval-gate
status: draft
owner: "evan"
tags: [workflow, approval, delivery]
created: 2026-05-18
updated: 2026-05-18
---

# 实施计划：人工审批门

## 目标

手动触发的 workflow 在 review 完成后进入 pending_approval，操作者通过 Dashboard 审批后再交付 PR。

## 任务清单

### T1: Schema 迁移 + orchestrator 核心逻辑

**范围**：`infra/postgres/migrations/003_approval_gate.sql` + `apps/orchestrator/src/index.ts`

- Migration: `ALTER TABLE workflow_runs ADD COLUMN rejection_reason TEXT`
- WorkflowRun.status 类型扩展为包含 `pending_approval`
- advanceWorkflow：所有步骤完成后按 trigger_type 分支
  - manual → pending_approval
  - 其他 → completed + onWorkflowCompleted
- 新增 `POST /workflows/:id/approve`：UPDATE WHERE status='pending_approval' + onWorkflowCompleted
- 新增 `POST /workflows/:id/reject`：UPDATE + 写入 rejection_reason + onWorkflowFailed + 结构化日志

**验证**：typecheck 通过

---

### T2: Dashboard 审批按钮

**范围**：`apps/dashboard/src/`

- `pages/WorkflowDetail.tsx`：status=pending_approval 时顶部显示 Approve / Reject 按钮（Reject 带 reason 输入）
- `api.ts`：新增 `approveWorkflow(id)` / `rejectWorkflow(id, reason?)`
- 按钮操作后刷新页面数据

**依赖**：T1 完成后开始

**验证**：typecheck 通过、按钮条件渲染正确

---

### T3: 集成测试

**范围**：`tests/integration/human-approval.test.ts`

- manual workflow 完成后 status = pending_approval
- approve → completed
- reject → failed + rejection_reason 持久化
- 重复 approve/reject → 409
- experiment workflow 跳过审批直接 completed

**依赖**：T1 完成后开始（与 T2 并行）

**验证**：测试通过

---

## 依赖关系

```
T1 → T2
T1 → T3
（T2 和 T3 可并行）
```

## 风险与阻塞

| 风险 | 影响 | 缓解 |
|------|------|------|
| advanceWorkflow 修改影响 experiment 流程 | experiment batch 被意外阻塞 | T3 显式测试 experiment 跳过 |

## 决策日志

| 决策 | 理由 |
|------|------|
| reject 直接 failed | 避免步骤回退复杂度，Phase 3 再做 |
| 按 trigger_type 决定 | 简单，experiment 天然不需审批 |
| 新增 rejection_reason 列 | 成本低，支持 Dashboard 历史查询和审计 |
| WHERE status = 'pending_approval' | 保证并发安全，无需额外锁 |
| WorkflowRun 类型仅 orchestrator 内部 | 不影响 worker-sdk 等其他包 |

## 完成标准

- T1-T3 全部完成
- `pnpm typecheck` 通过
- 单元测试 + 集成测试通过
- plan status → done, spec status → shipped
