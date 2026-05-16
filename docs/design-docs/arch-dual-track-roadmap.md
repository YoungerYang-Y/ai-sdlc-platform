---
id: arch-dual-track-roadmap
status: draft
owner: "evan"
tags: [architecture, roadmap, experiment-platform, delivery-platform]
created: 2026-05-14
verified:
---

# 双轨演进路线

## 背景与动机

当前平台同时承担两类目标：

1. 作为业务需求自动化执行平台，持续把需求推进到代码修改、验证和审查。
2. 作为实验平台，持续比较和优化 `skill`、`harness docs`、worker、模型和 runtime 配置的性价比。

如果按传统平台建设方式，先把交付链路做完整，再在后续阶段补实验能力，会出现两个问题：

- 执行内核会先围绕 `workflow` 和 `task` 定义接口，等实验能力补入时再返工 `attempt`、`version_set`、`scorecard` 等核心对象。
- 前期产出的日志、artifact 和 worker 协议只够“跑通任务”，不够支撑“重复实验、证据回放、版本对比和评分闭环”。

因此，平台演进策略不能是“交付平台优先、实验平台后置”，而应改为“双轨演进”：每一阶段都同时交付一个最小可用的业务闭环和实验闭环。

## 设计原则

1. 平台始终同时服务 `delivery mode` 和 `experiment mode`，但两者共享同一套执行内核。
2. 阶段规划以“闭环能力”定义，不以功能清单定义。每一期都必须回答“能否真实跑业务”和“能否真实做调优”。
3. `worker_attempt` 是执行内核正式对象，不是纯观测层附属概念。
4. `version_set` 必须从第一阶段进入运行身份模型，显式区分 `method_version` 与 `execution_version`。
5. 最小实验能力必须前置到第一阶段，而不是整体推迟到后续大版本。
6. 观测、评估和对比能力要按最小闭环逐步增强，避免一次性建设“完整实验平台”。

## 标准做法

### 1. 执行对象模型

执行内核按以下层次建模：

- `workflow_run`
- `task_run`
- `worker_attempt`

其中：

- `orchestrator` 负责 `workflow_run`
- `scheduler` 负责 `task_run`
- `worker` 执行并产生 `worker_attempt`

任何新的调度协议、worker 协议、观测索引和评分逻辑，都必须显式考虑 `worker_attempt` 生命周期：

- `attempt_created`
- `attempt_claimed`
- `attempt_heartbeat`
- `attempt_completed`
- `attempt_failed`
- `attempt_expired`

### 2. 版本身份模型

每次运行必须绑定一个 `version_set`，拆分为两条独立版本轴：

- `method_version`
  - system skill
  - project skill
  - harness docs
  - prompt
  - policy
- `execution_version`
  - worker implementation
  - model
  - runtime
  - toolchain
  - tuning params

`workflow_run` 和 `worker_attempt` 都必须可回溯到 `version_set`。

**不可变性约束**：`version_set` 一旦创建即不可变（immutable）。任何配置组合的变化必须创建新的 `version_set`，不允许就地修改已有记录。这保证了所有绑定到该 `version_set` 的 `workflow_run` 和 `worker_attempt` 的可追溯性和对比可信度。

### 3. 第一阶段的最小双轨闭环

第一阶段必须同时具备以下能力：

**交付侧**

- 跑通 `code -> verify -> review`
- 持久化 `workflow_run / task_run / lease / retry`
- 保存 patch、日志、审查报告等 artifact

**实验侧**

- 从固定 benchmark 或 ad-hoc task 发起运行
- 记录 `worker_attempt` 级别的上下文、reasoning、tool trace、token/cost、耗时和 artifact 引用
- 生成基础 `attempt_scorecard`
- 至少支持同一 benchmark 下两个 `version_set` 的基础比较

第一阶段不要求完整 Dashboard、复杂批量调度或完整人工校准，但必须让“交付”和“调优”都真实发生。

### 4. 推荐阶段划分

建议按以下四期演进：

#### Phase 1: Minimal Delivery + Minimal Experiment

- 交付：最小业务链路可运行
- 实验：最小 attempt 观测、版本绑定和基础 compare 可运行

#### Phase 2: Robust Execution + Operator UX

- 交付：更稳的调度、Claude Worker、基础人工介入、主操作视图
- 实验：experiment batch、benchmark 管理、attempt review、聚合评分

#### Phase 3: Full Evaluation & Optimization Loop

该阶段结束时能回答：

- **交付侧**：系统能否基于评估结果自动选择更优的 version_set 配置？
- **实验侧**：操作者能否从一组实验批次中识别出哪个配置在成本和质量之间最优？

闭环能力：
- 混合评分（rule + LLM + human）对同一 attempt 产出可信最终分
- calibration queue 将异常样本引导到人工校准，校准结果回馈评分模型
- feedback labeling 在 attempt 级挂载问题标签，传播建议生成 version_set / benchmark 级洞察
- compare / trend 视图让操作者可回答"版本 A 在哪些维度优于版本 B"

#### Phase 4: Productionization

该阶段结束时能回答：

- **交付侧**：系统能否在多团队并发使用下稳定运行，并满足 SLO？
- **实验侧**：实验批次能否在资源配额限制下自动排队，且不影响交付链路？

闭环能力：
- 多租户隔离使不同团队的 workflow_run 和 experiment batch 互不干扰
- Redis / 分布式队列使任务调度水平扩展，单点故障不导致全局停摆
- OTel + 告警形成"异常 → 告警 → 定位 → 修复"闭环
- 配额管理使实验批次在资源受限时自动排队而非失败

### 5. 文档维护规则

- `README.md` 中的多期计划必须反映双轨分期，而不是把实验平台整体后置为单独大阶段。
- `ARCHITECTURE.md` 中涉及核心对象模型的章节，必须体现 `workflow_run / task_run / worker_attempt / version_set` 的分层关系。
- 任何把实验能力整体推迟到后期的大改动，都应先更新本 RFC，再修改路线图。

**可自动检测的规则**（纳入 `lint-docs.ts` 或 CI 脚本）：

1. `README.md` 中每个 Phase/阶段描述段落必须同时包含 `delivery`（或"交付"）和 `experiment`（或"实验"）关键词——缺失则报错
2. `ARCHITECTURE.md` 中 "核心对象模型" 章节必须同时出现 `workflow_run`、`task_run`、`worker_attempt`、`version_set` 四个标识符
3. Phase 描述中禁止出现纯 bullet 功能清单（无"能回答"或"闭环能力"限定词的 Phase 段落视为违规）

### 6. 降级策略

当某一阶段的实验侧能力无法按期交付时：

| 场景 | 降级行为 | 约束 |
|------|----------|------|
| Phase 1 实验侧延期 | 允许 delivery mode 先独立上线，但 `worker_attempt` 和 `version_set` 的 schema 必须已就绪（空实现可接受） | 不允许 schema 也推迟——否则后续补入成本等同返工 |
| 观测事件上报不稳定 | attempt 标记 `observability_degraded`，不参与评分但保留执行结果 | delivery mode 不受影响 |
| 评估链路不可用 | scorecard 不生成，已有 attempt 证据正常入库，待恢复后批量补评 | 不阻塞后续任务调度 |

降级不改变架构约束——恢复后必须补齐缺失数据，而非永久跳过。

## 反模式

| 反模式 | 为什么禁止 |
|--------|-----------|
| 先做完整交付平台，实验平台后补 | 会导致 attempt、version_set、scorecard 等核心对象后补，执行协议和数据模型返工成本高 |
| 把 `worker_attempt` 仅作为日志或 trace 概念 | 无法稳定支持回放、评分、版本比较和实验索引 |
| 用备注字符串记录 skill / docs / model 版本 | 无法形成稳定的运行身份模型，也无法做可信对比 |
| 把阶段写成功能清单而不是闭环能力 | 阶段完成后很难判断平台是否真的可交付、可调优 |

## 适用范围

- `README.md` 的多期能力规划
- `ARCHITECTURE.md` 中的核心对象模型和路线图表述
- `apps/orchestrator`、`packages/scheduler`、`packages/worker-sdk` 的协议设计
- `observability`、`evaluation`、`experiment` 相关模块设计

## 参考

- `ARCHITECTURE.md`
- `README.md`
- `docs/design-docs/core-beliefs.md`
- `docs/PRODUCT_SENSE.md`
