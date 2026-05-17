---
id: spec-phase2-dashboard
status: draft
owner: "evan"
tags: [phase2, delivery, experiment, dashboard, ux]
created: 2026-05-17
updated: 2026-05-17
---

# 产品规格：Phase 2 基础 Dashboard

## 问题与动机

当前平台只能通过 curl 调用 API 来提交 workflow 和查看结果，操作门槛高，无法直观看到执行状态、产物内容和时间线。需要一个基础 Web 界面让操作者能提交需求、监控进度、查看产出。

这也是 Phase 2 实验侧 "Operator UX" 的入口——操作者需要能看到 attempt 执行结果、审查报告和评分数据，才能进行后续的调优决策。

## 功能边界

### In Scope

- Workflow 列表页（状态筛选、自动刷新）
- Workflow 详情页（task 时间线、attempt 信息、产物查看）
- Patch diff 可视化
- Review 报告 markdown 渲染
- 提交 Workflow 表单（替代 curl）

### Out of Scope

- 用户认证/权限
- Scorecard 对比视图 → Phase 2 实验侧独立 spec
- Benchmark batch 管理 UI → Phase 2 实验侧独立 spec
- 实时 WebSocket 推送（用轮询）
- 移动端适配
- 国际化

## 用户场景

### 场景 1：提交新需求

1. 用户打开 Dashboard，点击"新建 Workflow"
2. 填写需求描述、仓库路径/URL、验收命令
3. 点击提交
4. 自动跳转到该 workflow 的详情页，看到 running 状态

### 场景 2：监控执行进度

1. 用户在列表页看到所有 workflow，running 的排在前面
2. 页面自动刷新状态
3. 用户点击某个 workflow 进入详情
4. 看到 code → verify → review 每步的状态和耗时

### 场景 3：查看产出

1. Workflow 完成后，用户在详情页看到：
   - Patch diff（代码变更高亮）
   - Review 报告（markdown 格式）
   - 验证日志

### 场景 4：排查失败

1. 用户在列表页看到 failed 状态的 workflow
2. 进入详情页看到哪个 step 失败
3. 查看 failure_reason 和验证日志定位问题

### 场景 5：查看执行中的 workflow

1. Workflow 正在 running
2. 用户进入详情页，已完成的步骤显示产物
3. 正在执行的步骤显示"执行中"
4. 未开始的步骤显示"待执行"

## 输入与输出

### 用户输入

- 提交表单：需求描述、仓库来源（URL 或本地路径）、分支、验收命令、触发类型

### 用户可见输出

- Workflow 列表（状态、时间、需求摘要）
- 执行时间线（每步状态、耗时）
- Patch diff（语法高亮）
- Review 报告（markdown 渲染）
- 验证日志
- 失败原因

## 验收标准

- [ ] Given 打开 Dashboard, When 页面加载, Then 看到 workflow 列表（含状态 badge 和时间）
- [ ] Given 列表页, When 选择状态筛选, Then 只显示对应状态的 workflow
- [ ] Given 列表页有 running 的 workflow, When 等待数秒, Then 列表自动刷新状态
- [ ] Given 点击某 workflow, When 进入详情页, Then 看到 task 时间线和 attempt 信息
- [ ] Given workflow 有 patch 产物, When 查看详情, Then 看到 diff 高亮显示
- [ ] Given workflow 有 review 报告, When 查看详情, Then 看到 markdown 渲染的报告
- [ ] Given workflow 正在 running, When 查看详情的产物区域, Then 显示"执行中"而非空白
- [ ] Given 点击"新建 Workflow", When 填写表单并提交, Then workflow 被创建并跳转到详情页
- [ ] Given 表单必填项为空, When 点击提交, Then 显示校验错误不提交

## 异常与边界情况

| 场景 | 触发条件 | 预期行为 |
|------|----------|----------|
| 后端不可达 | Orchestrator 未启动 | 显示连接错误提示 |
| 列表为空 | 无 workflow 记录 | 显示"暂无数据"和创建引导 |
| 产物未生成 | workflow 还在 running | 相应区域显示"执行中" |
| 提交失败 | API 返回 4xx/5xx | 表单显示错误信息，不跳转 |

## 产品约束

- 纯前端 SPA，不需要 SSR
- 生产部署时通过 nginx 或 Orchestrator 服务静态文件

## 度量

- 操作者从 curl 迁移到 Dashboard 使用率 > 80%
- 从打开 Dashboard 到查看产出 < 5 秒（相比 curl 多步流程）
