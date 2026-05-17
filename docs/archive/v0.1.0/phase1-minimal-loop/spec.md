---
id: spec-phase1-minimal-loop
status: shipped
owner: "evan"
tags: [phase1, delivery, experiment, core]
created: 2026-05-16
updated: 2026-05-17
---

# 产品规格：Phase 1 最小双轨闭环

## 问题与动机

平台当前只有设计文档和目录骨架，没有可运行的代码。需要实现第一个端到端闭环——能真实跑通一个需求从 code 到 review 的全流程，同时记录 attempt 级别的观测数据用于后续实验对比。

## 目标用户

- 平台开发者（通过 CLI 提交任务，验证平台核心链路）
- 实验操作者（对比不同 version_set 配置下的 attempt 表现）

## 功能边界

**做什么（In Scope）**：
- 通过 CLI/API 提交一个需求，触发 workflow_run
- Orchestrator 按 code → verify → review 线性流程推进
- Scheduler 调度 task_run，Worker 认领并执行
- Code Worker 调用 CLI 生成 patch 并验证
- Review Worker 调用 CLI 审查 patch
- 全链路状态持久化到 PostgreSQL
- 产物（patch、日志、报告）写入文件系统 + 元数据索引
- Worker attempt 级别的证据事件和 summary 上报到 Observability
- version_set 绑定，attempt 可追溯到版本身份
- 基础 rule score 生成 attempt_scorecard

**不做什么（Out of Scope）**：
- Dashboard 可视化界面
- Human-in-the-loop 审查点
- 多 Worker 并发竞争
- 实验批次管理和批量对比
- LLM 评分和人工校准
- 多仓库支持（Phase 1 单仓库）
- OpenHands sandbox 隔离
- 需求分析和自动测试步骤

## 用户场景

### 场景 1：提交需求并等待结果

1. 用户通过 HTTP API 提交需求（requirement + repository + version_set_id）
2. 系统创建 workflow_run，按 code → verify → review 逐步执行
3. 用户通过 API 查询 workflow 状态，最终获得 completed/failed 结果
4. 用户可查看产物（patch、审查报告）

### 场景 2：对比两个配置的表现

1. 用户用 version_set A 跑同一个任务
2. 用户用 version_set B 跑同一个任务
3. 用户查询两个 attempt 的 scorecard，比较哪个配置更优

## 验收标准

- [ ] Given 一个合法需求, When POST /workflows, Then workflow_run 被创建且进入 running 状态
- [ ] Given workflow_run 正在运行, When code task 完成, Then verify task 自动提交
- [ ] Given verify 完成, When review task 完成, Then workflow_run 进入 completed
- [ ] Given Worker 启动, When Scheduler 有 ready 任务, Then Worker 可 claim 并执行
- [ ] Given attempt 执行完毕, When evidence 和 summary 都上报, Then observability 状态进入 complete
- [ ] Given observability complete, When eval trigger 触发, Then rule score 生成 attempt_scorecard
- [ ] Given 同一任务两个 version_set, When 分别执行完毕, Then 两个 scorecard 可比较

## 异常与边界情况

| 场景 | 触发条件 | 预期行为 |
|------|----------|----------|
| CLI 执行失败 | CLI 返回非零退出码 | attempt 标记 failed，Scheduler 按策略重试 |
| Worker 崩溃 | heartbeat 停止 | lease 过期，attempt 标记 expired，task 回到 ready |
| 观测上报失败 | Observability 不可用 | 不阻塞执行链路，attempt 标记 observability_degraded |
| 重试耗尽 | attempt 连续失败超过 max_attempts | task_run 标记 permanently_failed，workflow_run 标记 failed |

## 产品约束

- 全链路 TypeScript 实现
- 单 PostgreSQL 实例
- 单进程 Orchestrator（Scheduler 嵌入）
- Worker 本地运行 CLI（宿主机认证）
- 不依赖外部 Agent 框架
