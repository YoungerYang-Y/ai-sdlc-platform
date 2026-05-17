---
id: design-phase2-dashboard
status: draft
owner: "evan"
tags: [phase2, delivery, dashboard, react]
created: 2026-05-17
updated: 2026-05-17
verified:
---

# 设计：Phase 2 基础 Dashboard

## 背景

平台需要一个 Web 界面让操作者能提交需求、监控进度、查看产出，替代 curl 调 API 的方式。

## 技术方案

### 技术栈

- React 18 + TypeScript
- Vite（构建）
- Tailwind CSS（样式）
- react-router v6（路由）
- Vite proxy → Orchestrator :8000

### 页面路由

| 路径 | 页面 | 说明 |
|------|------|------|
| `/` | WorkflowList | 列表页，首页 |
| `/workflows/:id` | WorkflowDetail | 详情页 |
| `/workflows/new` | WorkflowCreate | 提交表单 |

### 后端 API 补充

现有 API：
- `POST /workflows` — 创建
- `GET /workflows/:id` — 查询单个

需要新增：
- `GET /workflows` — 列表查询，支持 `?status=running` 筛选，按 created_at DESC 排序

### 数据流

```
Dashboard → fetch /api/workflows → Orchestrator :8000
         → fetch /api/workflows/:id
         → POST /api/workflows (创建)
         
Vite proxy: /api/* → http://localhost:8000/*
```

### 组件设计

```
App
├── WorkflowList
│   ├── StatusFilter (tabs: all/running/completed/failed)
│   └── WorkflowTable (row → link to detail)
├── WorkflowDetail
│   ├── WorkflowHeader (id, status badge, times)
│   ├── TaskTimeline (code → verify → review 步骤卡片)
│   ├── DiffViewer (patch diff 高亮)
│   └── MarkdownView (review 报告)
└── WorkflowCreate
    └── CreateForm (fields + submit)
```

### Diff 渲染

使用简单的行级 diff 高亮（绿色新增/红色删除），不引入重依赖：
- 按行 split patch 内容
- `+` 开头 → 绿背景
- `-` 开头 → 红背景
- `@@` 开头 → 灰色分隔

### 产物获取

当前 artifact 在文件系统中，前端无法直接访问。需要 Orchestrator 新增：
- `GET /artifacts/:ref` — 返回产物内容（text/plain 或 text/markdown）

ref 格式已有：`<type>/<workflowRunId>/<taskRunId>/<filename>`

## 影响范围

| 模块 | 路径 | 变更类型 | 说明 |
|------|------|----------|------|
| Dashboard | `apps/dashboard/` | 重写 | React + Tailwind 完整实现 |
| Orchestrator | `apps/orchestrator/src/index.ts` | 修改 | 新增 GET /workflows 列表 + GET /artifacts/:ref |

## 约束

- 开发时 Dashboard 跑 :5173（Vite 默认），proxy 到 :8000
- 不引入状态管理库（useState + useEffect 足够）
- 不引入 diff 库（自实现行级高亮，<100 行代码）
- markdown 渲染不引入大库（简单正则处理标题/列表/代码块，或引入轻量的 marked）

## 迁移与兼容

不适用。纯新增前端应用。

## 发布与回滚

- 开发：`pnpm --filter @ai-sdlc/dashboard dev`
- 构建：`pnpm --filter @ai-sdlc/dashboard build` → `apps/dashboard/dist/`
- 部署：静态文件服务

## 验证方式

- 手动验证：启动 Dashboard + Orchestrator，提交 workflow，查看结果
- 无自动化 E2E（Dashboard 是展示层，投入产出比低）

## 备选方案

### 方案 A（已否决）：Orchestrator 内嵌 HTML 模板

- **优势**：零前端构建，单进程
- **否决原因**：无法实现良好的交互体验（diff 高亮、实时刷新、SPA 路由），且违反前后端分离原则

### 方案 B（已否决）：Next.js SSR

- **优势**：SEO 好、首屏快
- **否决原因**：内部工具不需要 SEO，SSR 增加复杂度，Vite + React CSR 足够
