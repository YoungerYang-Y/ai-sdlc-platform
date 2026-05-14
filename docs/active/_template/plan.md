---
id: plan-{slug}
status: not-started
owner: ""
tags: []
created: YYYY-MM-DD
updated: YYYY-MM-DD
---
<!--
  frontmatter 字段说明：
  - id:       唯一标识，格式 plan-{slug}（与同目录 spec/design 共享 slug）
  - status:   not-started | in-progress | completed | blocked（lint 强制校验）
  - owner:    计划负责人
  - tags:     领域标签
  - created/updated: ISO 日期
  同目录下的 spec.md 和 design.md 共享相同 slug，无需显式交叉引用。

  本文档承接 design-doc，回答"怎么拆、谁执行、什么顺序"。
  任务块使用结构化格式，支持 agent 断点续跑和并行调度。
-->

# 计划：{标题}

## 目标

<!-- 一段话：这个计划要达成什么。从 design-doc 的技术方案概括。 -->

## 执行模式

<!--
  根据任务数量和依赖关系选择（参考 docs/guides/PLANS.md § 计划类型）：
  - sequential:  任务之间有顺序依赖，单 agent 按序
  - parallel:    任务之间无共享状态，subagent 并行
  - mixed:       先完成前置任务，再 fan-out 独立任务
-->

模式：<!-- sequential / parallel / mixed -->

## 任务列表

<!--
  每个任务是一个结构化块。字段说明：
  - id:           任务唯一标识（T1, T2, ...）
  - depends_on:   依赖的任务 id 列表，无依赖填 []
  - scope:        影响的文件/模块路径
  - verify:       验证命令或检查方式
  - agent:        执行者（main / subagent-N / 人名）
  - status:       todo / doing / done / blocked
  - deliverable:  交付物（文件路径、PR 链接等）
-->

### T1: <!-- 任务描述 -->
- depends_on: []
- scope: `<!-- path/to/file -->`
- verify: `<!-- 验证命令，如 npm test -- --grep "xxx" -->`
- agent: main
- status: todo
- deliverable: <!-- 交付物 -->

### T2: <!-- 任务描述 -->
- depends_on: [T1]
- scope: `<!-- path/to/file -->`
- verify: `<!-- 验证命令 -->`
- agent: main
- status: todo
- deliverable: <!-- 交付物 -->

### T3: <!-- 任务描述（可与 T2 并行） -->
- depends_on: [T1]
- scope: `<!-- path/to/file -->`
- verify: `<!-- 验证命令 -->`
- agent: subagent-1
- status: todo
- deliverable: <!-- 交付物 -->

## 决策日志

<!-- 执行过程中的重要决策。格式：日期 — 决策 — 理由 -->

## 风险与阻塞

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| <!-- 风险 --> | <!-- 高/中/低 --> | <!-- 措施 --> |

## 完成标准

- [ ] 所有任务 status = done
- [ ] 测试通过（单元 + 集成）
- [ ] design-doc status 更新为 verified
- [ ] 剩余债务已记录到 `tech-debt-tracker.md`
