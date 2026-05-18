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

### T1: orchestrator advanceWorkflow 分支 + approve/reject API

**范围**：`apps/orchestrator/src/index.ts`

- advanceWorkflow：当所有步骤完成时，按 trigger_type 分支
  - `manual` → status = pending_approval，不触发 onWorkflowCompleted
  - 其他 → 现有逻辑（completed + onWorkflowCompleted）
- 新增 `POST /workflows/:id/approve`
  - UPDATE ... WHERE status = 'pending_approval'，返回 409 若不匹配
  - 成功后构建 WorkflowRun 对象，调用 onWorkflowCompleted
- 新增 `POST /workflows/:id/reject`
  - UPDATE ... WHERE status = 'pending_approval'，返回 409 若不匹配
  - 成功后调用 onWorkflowFailed
- WorkflowRun 类型新增 `pending_approval` 到 status 联合类型

**验证**：typecheck 通过、API 行为正确

---

### T2: Dashboard 审批按钮

**范围**：`apps/dashboard/src/`

- `pages/WorkflowDetail.tsx`：status = pending_approval 时显示 Approve / Reject 按钮
- `api.ts`：新增 `approveWorkflow(id)` / `rejectWorkflow(id, reason?)`
- 按钮操作后刷新页面数据

**验证**：按钮条件渲染正确、typecheck 通过

---

### T3: 集成测试

**范围**：`tests/integration/`

- 测试 approve：pending_approval → completed
- 测试 reject：pending_approval → failed
- 测试重复审批：返回 409
- 测试 experiment workflow 跳过审批

**验证**：测试通过

---

## 依赖关系

```
T1 → T2（并行）
T1 → T3（并行）
```

## 风险与阻塞

| 风险 | 影响 | 缓解 |
|------|------|------|
| advanceWorkflow 修改影响现有流程 | experiment workflow 可能意外被阻塞 | 集成测试显式验证 experiment 跳过 |

## 决策日志

| 决策 | 理由 |
|------|------|
| reject 直接 failed | 避免步骤回退复杂度，Phase 3 再做 |
| 按 trigger_type 而非显式参数 | 简单，experiment 天然不需审批 |
| 不新增 DB 列 | reject reason 记录日志即可，schema 不变 |
| WHERE status = 'pending_approval' | 保证并发安全，无需额外锁 |
