---
id: design-phase2-scorecard-compare
status: draft
owner: "evan"
tags: [phase2, experiment, scorecard, api, dashboard]
created: 2026-05-17
updated: 2026-05-17
verified:
---

# 设计：Scorecard 比较

## 背景

补齐 Phase 1 验收标准 #7 的最后一环：提供 scorecard 查询和对比能力，让操作者能回答"哪个配置更好"。

## 技术方案

### 后端 API

新增 1 个端点：

```
GET /scorecards/compare?a=<workflowId>&b=<workflowId>
```

返回：
```json
{
  "a": {
    "workflowId": "...",
    "implementation": "kiro",
    "status": "completed",
    "durationMs": 24000,
    "scorecard": { "success": 1, "efficiency": 1, "cost": 1, "total": 1.0 }
  },
  "b": {
    "workflowId": "...",
    "implementation": "codex",
    "status": "completed",
    "durationMs": 35000,
    "scorecard": { "success": 1, "efficiency": 0.8, "cost": 0.9, "total": 0.92 }
  }
}
```

查询逻辑：
1. 通过 workflowId 找到关联的 worker_attempts
2. 取最新 completed 的 attempt 的 scorecard_revision
3. 从 attempt_summary_reports 取 implementation 和 durationMs
4. 如果无 scorecard，对应字段返回 null

### Dashboard 页面

新增路由：`/compare?a=<id>&b=<id>`

页面结构：
```
CompareView
├── SelectorBar (两个 workflow ID 输入/选择器)
├── CompareCard (左右并排)
│   ├── WorkflowInfo (id, implementation, status, duration)
│   └── ScoreBar (每个维度一行，数值 + 进度条 + 胜出标识)
└── Summary (总分对比，胜出方高亮)
```

### 列表页集成

WorkflowList 表格每行增加复选框，选中 2 个后出现"对比"按钮，点击跳转 `/compare?a=xxx&b=yyy`。

## 影响范围

| 模块 | 路径 | 变更类型 | 说明 |
|------|------|----------|------|
| Orchestrator | `apps/orchestrator/src/index.ts` | 修改 | 新增 GET /scorecards/compare |
| Dashboard | `apps/dashboard/src/pages/CompareView.tsx` | 新增 | 对比页面 |
| Dashboard | `apps/dashboard/src/pages/WorkflowList.tsx` | 修改 | 增加复选框 + 对比按钮 |
| Dashboard | `apps/dashboard/src/api.ts` | 修改 | 新增 fetchCompare |
| Dashboard | `apps/dashboard/src/main.tsx` | 修改 | 新增 /compare 路由 |

## 约束

- 不新增数据库表，只查询现有 scorecards + summary_reports
- 对比粒度为 workflow（每个 workflow 取最优 attempt 的 scorecard）
- 无 scorecard 时返回 null，前端展示占位

## 迁移与兼容

不适用。

## 发布与回滚

同 Dashboard，前端静态文件更新即可。后端新增只读 API，无副作用。

## 验证方式

手动验证：跑两个 workflow（不同 implementation），在 Dashboard 对比页面查看。

## 备选方案

### 方案 A（已否决）：前端直接查两个 workflow 的 scorecard 再 diff

- **优势**：不需要新 API
- **否决原因**：前端需要多次请求（workflow → attempts → scorecards），逻辑复杂；后端聚合一次返回更高效。
