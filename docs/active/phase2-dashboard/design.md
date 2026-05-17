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
- Vite（构建 + 开发代理）
- Tailwind CSS（样式）
- react-router v6（路由）
- marked（markdown 渲染，35KB gzipped，API 稳定）

### 页面路由

| 路径 | 页面 | 说明 |
|------|------|------|
| `/` | WorkflowList | 列表页，首页 |
| `/workflows/:id` | WorkflowDetail | 详情页 |
| `/workflows/new` | WorkflowCreate | 提交表单 |

### 后端 API 补充

现有：
- `POST /workflows` — 创建
- `GET /workflows/:id` — 查询单个

新增：
- `GET /workflows?status=running&limit=50` — 列表查询，按 created_at DESC，默认 limit=50，最大 100
- `GET /artifacts/*` — 返回产物原始内容，Content-Type 根据文件类型设定

### GET /artifacts 安全设计

ref 路径格式：`<artifactType>/<workflowRunId>/<taskRunId>/<filename>`

防路径遍历：
- ref 中不允许 `..` 和绝对路径（以 `/` 开头）
- 校验 ref 格式匹配 `^[a-z_]+/[0-9a-f-]+/[0-9a-f-]+/[a-zA-Z0-9._-]+$`
- 拼接 basePath + ref 后使用 `path.resolve` 验证结果仍在 basePath 下

响应格式：直接返回 raw content + Content-Type header：
- `.diff` → `text/x-diff`
- `.md` → `text/markdown`
- `.log` → `text/plain`

### 分页策略

Phase 2 使用简单 limit 限制：
- `GET /workflows?limit=50` — 默认返回最近 50 条
- 不做 offset 分页（数据量小，全量够用）
- 后续数据量增长时再补 cursor 分页

### 轮询策略

- **列表页**：存在 running 状态的 workflow 时 5s 轮询，全部终态后停止
- **详情页**：workflow 状态非终态时 3s 轮询，进入 completed/failed 后停止
- 页面不可见时（`document.hidden`）暂停轮询

### 组件设计

```
App
├── WorkflowList
│   ├── StatusFilter (tabs: all/running/completed/failed)
│   └── WorkflowTable (row → link to detail)
├── WorkflowDetail
│   ├── WorkflowHeader (id, status badge, times)
│   ├── TaskTimeline (code → verify → review 步骤卡片)
│   ├── DiffViewer (patch diff 行级高亮)
│   └── MarkdownView (marked 渲染 review 报告)
└── WorkflowCreate
    └── CreateForm (fields + validation + submit)
```

### Diff 渲染（自实现，不引入库）

按行 split patch 内容：
- `+` 开头 → 绿背景
- `-` 开头 → 红背景
- `@@` 开头 → 灰色分隔符
- 其他 → 正常行

### 现有 apps/dashboard 处理

当前 `apps/dashboard/` 只有空壳（一个 `src/index.ts` export 空对象）。实施时**完全重写此目录**为 Vite + React 项目，不兼容现有结构。

## 影响范围

| 模块 | 路径 | 变更类型 | 说明 |
|------|------|----------|------|
| Dashboard | `apps/dashboard/` | 重写 | React + Vite + Tailwind 完整实现 |
| Orchestrator | `apps/orchestrator/src/index.ts` | 修改 | 新增 GET /workflows + GET /artifacts/* |

## 约束

- 开发时 Dashboard :5173 通过 Vite proxy 转发 `/api/*` 到 :8000
- 不引入状态管理库（useState + useEffect 足够）
- 不引入 diff 渲染库（自实现行级高亮）
- markdown 渲染使用 marked（API 稳定、体积小）

## 迁移与兼容

不适用。纯新增前端应用 + 新增 2 个 GET 端点（不影响现有 API）。

## 发布与回滚

- 开发：`pnpm --filter @ai-sdlc/dashboard dev`
- 构建：`pnpm --filter @ai-sdlc/dashboard build`
- 回滚：删除静态文件即可，后端 API 向后兼容

## 观测性

不适用（前端展示层）。

## 验证方式

Phase 2 不做前端自动化测试，理由：
- Dashboard 是薄展示层，逻辑简单
- 手动验证成本低（启动 → 提交 → 查看）
- E2E 测试（如 Playwright）投入产出比不合适此阶段

验证方式：手动验证所有验收标准条目。

## 异常处理

| 异常 | 策略 |
|------|------|
| API 请求失败 | 显示 toast 错误提示，不崩溃 |
| artifact 内容加载失败 | 显示"加载失败"占位 |
| 网络断开 | 轮询暂停，显示离线提示 |

## 备选方案

### 方案 A（已否决）：Orchestrator 内嵌 HTML 模板

- **优势**：零前端构建，单进程
- **否决原因**：无法实现良好交互（diff 高亮、SPA 路由、实时刷新）

### 方案 B（已否决）：Next.js SSR

- **优势**：SSR 首屏快
- **否决原因**：内部工具不需要 SEO，增加不必要的复杂度
