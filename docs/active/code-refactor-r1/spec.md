---
id: spec-code-refactor-r1
status: in-progress
owner: "evan"
tags: [refactor, code-quality]
created: 2026-05-19
updated: 2026-05-19
---

# 产品规格：代码审查与重构

## 问题与动机

项目从 v0.1.0 快速迭代到当前状态，核心模块（orchestrator、evaluation、code-worker）因增量开发积累了职责混合和重复代码。主要痛点：

- orchestrator/index.ts 300+ 行混合 workflow engine + HTTP 路由 + 文件操作
- DB row → domain object 映射重复 5 处
- evaluation 单文件承载 3 个不同职责
- code-worker handler 与 git 工具混在同一文件

## 功能边界

**做什么**：
- 拆分大文件为职责单一的小模块
- 消除重复的映射代码
- 统一 Dashboard 错误处理模式

**不做什么**：
- 不改变任何公共 API 行为
- 不引入新依赖
- 不修改已有测试的断言逻辑
- 不改变对外导出的函数签名

## 验收标准

- [ ] `pnpm typecheck` 14/14 通过
- [ ] `pnpm -r --filter='!@ai-sdlc/scheduler' --filter='!@ai-sdlc/observability' run test` 全绿
- [ ] orchestrator/src/index.ts ≤ 100 行
- [ ] 每个拆分出的文件职责单一（单一导出主题）
- [ ] 无新增 lint 或 test 失败

## 产品约束

- 纯内部重构，无用户可感知行为变化
- 不阻塞其他开发任务
