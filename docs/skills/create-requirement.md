---
updated: 2026-05-16
---

# Skill: 创建需求流程

## 触发条件

- 收到新功能请求或修复请求
- 任务级别判定为"中任务"或"大任务"（见 `docs/guides/WORKFLOW.md` 分级表）

## 前置条件

- [ ] 已读 `docs/guides/WORKFLOW.md` 确认任务级别
- [ ] 已读 `ARCHITECTURE.md` 确认不涉及架构变更（否则转 `architecture-rfc.md`）
- [ ] 已确定需求 slug（kebab-case，简短有意义）

## 步骤

### 1. 判定任务级别

按 `docs/guides/WORKFLOW.md` 的分级表：

| 级别 | 条件 | 产出 |
|------|------|------|
| 中任务 | 4-8 task，跨 2 模块，或涉及契约变更 | design.md + plan.md |
| 大任务 | > 8 task，跨 3+ 模块，新领域 | spec.md + design.md + plan.md |

### 2. 创建需求目录

从项目根目录执行：

```bash
node "$HARNESS_ENGINEERING_SKILL_DIR/scripts/create-requirement.ts" <slug> <medium|large>
```

脚本自动完成：
- 创建 `docs/active/{slug}/` 目录
- 复制对应模板文件
- 填充 frontmatter（slug、日期）
- 注册到 `docs/active/index.md`

### 3. 按序填写文档

**大任务**：spec.md → 审查循环 → design.md → 审查循环 → plan.md → 审查循环

**中任务**：design.md → 审查循环 → plan.md → 审查循环

每份文档写完后必须经过 `docs/guides/REVIEW.md` 的三轮自审：
- R1 结构审查（通过线 16/20）
- R2 逻辑审查（通过线 16/20）
- R3 可执行审查（通过线 16/20）

### 4. 填写要点

**spec.md**（大任务）：
- 参考 `docs/guides/SPEC.md`
- 重点：用户故事、验收标准、非功能约束

**design.md**：
- 参考 `docs/guides/DESIGN.md`
- 重点：技术方案、影响范围表、风险评估、回滚策略

**plan.md**：
- 参考 `docs/guides/PLANS.md`
- 重点：任务拆分（id / depends_on / scope / verify / agent / status）、执行模式、风险

### 5. 验证

```bash
node "$HARNESS_ENGINEERING_SKILL_DIR/scripts/lint-docs.ts"
```

## 验收标准

- [ ] 需求目录存在于 `docs/active/{slug}/`
- [ ] 所有文档通过三轮审查循环
- [ ] `docs/active/index.md` 已包含新条目
- [ ] `lint-docs.ts` 通过

## 注意事项

- 禁止手动创建需求目录——必须使用脚本
- 小任务不走此流程，直接实施
- 如果发现需要修改 `ARCHITECTURE.md`，停止，转 `architecture-rfc.md`
