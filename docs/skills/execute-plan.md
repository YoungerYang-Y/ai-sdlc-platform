---
updated: 2026-05-16
---

# Skill: 执行实施计划

## 触发条件

- `docs/active/{slug}/plan.md` 已通过审查循环
- 所有前置文档（spec/design）状态为 approved

## 前置条件

- [ ] plan.md 存在且通过三轮审查
- [ ] 已确认执行模式（sequential / parallel / mixed）
- [ ] 已读相关的 design.md 了解技术方案

## 步骤

### 1. 确认执行模式

读取 plan.md 的执行模式字段：

| 模式 | 条件 | 策略 |
|------|------|------|
| sequential | 任务间有顺序依赖 | 单 agent 按序执行 |
| parallel | 任务间无共享状态 | subagent 并行执行 |
| mixed | 部分依赖 | 先完成前置，再 fan-out |

### 2. 逐任务执行

对 plan.md 中每个任务：

1. 读取任务的 `scope` 和 `depends_on`
2. 确认前置任务已完成
3. 实施代码变更
4. 运行任务的 `verify` 命令
5. 更新 plan.md 中该任务 `status` 为 `done`

### 3. 每个任务的实施规则

- 保持变更范围在 `scope` 定义内
- 不违反 `ARCHITECTURE.md` 的依赖方向
- 行为变化必须有对应测试
- 单次变更保持原子性（可独立回退）

### 4. 并行执行（parallel / mixed 模式）

当独立任务 ≥ 5 个时使用 subagent：

```
先完成所有前置任务（sequential 阶段）
↓
识别无依赖的独立任务集合
↓
使用 subagent 并行执行
↓
汇总结果，继续后续依赖任务
```

每个 subagent 接收：
- 任务 scope 和 verify 命令
- 相关的 design.md 上下文
- 项目约束（ARCHITECTURE.md 摘要）

### 5. 收尾

1. 确认所有任务 status = done
2. 运行全局验证：

```bash
pnpm build
pnpm test
pnpm lint
pnpm typecheck
```

3. 同步受影响的文档（ARCHITECTURE.md、DOMAINS.md 等）
4. 更新 plan.md 的整体状态
5. 输出变更摘要，遗留项登记到 `docs/active/tech-debt-tracker.md`

## 验收标准

- [ ] plan.md 中所有任务 status = done
- [ ] 所有 verify 命令通过
- [ ] 全局构建和测试通过
- [ ] 受影响文档已同步
- [ ] 遗留项已登记

## 失败处理

- 单个任务失败：记录原因到 plan.md 决策日志，尝试修复（最多 2 次），仍失败则标记为 blocked 并继续其他无依赖任务
- 全局验证失败：定位失败任务，回退该任务变更，重新实施
- 架构冲突：停止实施，回到 design.md 修改方案
