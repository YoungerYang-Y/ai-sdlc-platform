---
id: spec-human-approval-gate
status: draft
owner: "evan"
tags: [workflow, approval, delivery]
created: 2026-05-18
updated: 2026-05-18
---

# 产品规格：人工审批门

## 问题与动机

当前 workflow 完成 review 后直接创建 PR，操作者无法在 PR 交付前审核代码变更质量。AI 审查可能放过问题，需要人工作为最终质量门。

## 目标用户

- **平台操作者**：在代码交付前审核变更质量，决定是否放行

## 功能边界

**做什么（In Scope）**：
- workflow_run 新增 `pending_approval` 状态
- 手动触发（trigger_type=manual）的 workflow 在 review 完成后进入 pending_approval
- 操作者在 WorkflowDetail 页面执行 Approve 或 Reject
- Approve → completed + PR delivery
- Reject → failed

**不做什么（Out of Scope）**：
- Reject 后自动重试（Phase 3）
- 独立审批队列页面
- 实验 workflow（trigger_type=experiment）的审批
- 审批超时自动处理

## 用户场景

### 场景 1：审批通过

1. 操作者提交手动 workflow（trigger_type=manual）
2. 系统执行 code → verify → review
3. review 完成后，workflow 状态变为 pending_approval
4. 操作者进入 WorkflowDetail 页面，查看 patch + review report
5. 操作者点击 Approve
6. 系统标记 completed，触发 PR delivery

### 场景 2：审批拒绝

1. 同场景 1 步骤 1-4
2. 操作者点击 Reject（可填写拒绝原因）
3. 系统标记 failed，不触发 PR delivery

### 场景 3：实验 workflow 自动跳过

1. 操作者发起 experiment batch
2. 每个 workflow_run 完成 review 后直接进入 completed
3. 无需人工操作

## 输入与输出（用户视角）

| 方向 | 用户提供/看到什么 | 约束 |
|------|-------------------|------|
| 输入 | 点击 Approve 或 Reject（+ 可选 reason） | 仅 pending_approval 状态可操作 |
| 输出 | workflow 状态变更 + PR 创建（approve 时） | — |

## 验收标准

- [ ] Given trigger_type=manual 的 workflow 完成 review, When 状态查询, Then status = pending_approval
- [ ] Given trigger_type=experiment 的 workflow 完成 review, When 状态查询, Then status = completed（跳过审批）
- [ ] Given pending_approval 的 workflow, When 操作者 approve, Then status = completed 且触发 PR delivery
- [ ] Given pending_approval 的 workflow, When 操作者 reject, Then status = failed
- [ ] Given 非 pending_approval 的 workflow, When 调用 approve/reject API, Then 返回 409
- [ ] Given WorkflowDetail 页面, When workflow 状态为 pending_approval, Then 显示 Approve/Reject 按钮

## 异常与边界情况

| 场景 | 触发条件 | 预期行为 |
|------|----------|----------|
| 重复审批 | 对已 completed/failed 的 workflow 调用 approve | 返回 409 Conflict |
| 并发审批 | 两人同时 approve | 一个成功一个 409（WHERE status = 'pending_approval'） |

## 产品约束

- 不改变 experiment workflow 行为
- 不改变现有 workflow 步骤定义模型
- approve 后 PR delivery 仍为 best-effort

## 度量与成功标准

- 手动 workflow 100% 经过人工审批后才交付 PR
