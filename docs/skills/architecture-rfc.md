---
updated: 2026-05-16
---

# Skill: 架构 RFC 流程

## 触发条件

- 需要修改 `ARCHITECTURE.md` 或 `docs/design-docs/core-beliefs.md`
- 需要变更模块间依赖方向
- 需要引入新的核心对象或改变现有对象生命周期
- 实施中发现必须违反架构约束

## 前置条件

- [ ] 已确认这是长期约束变更（不是单次需求的设计决策）
- [ ] 已读 `docs/design-docs/index.md` 确认没有已有 RFC 覆盖此主题
- [ ] 已读 `docs/design-docs/core-beliefs.md` 确认变更不违反信条（或同时修改信条）

## 步骤

### 1. 创建 RFC 文档

复制模板：

```bash
cp docs/design-docs/_template.md docs/design-docs/arch-{主题名}.md
```

命名规则：
- 架构 RFC 必须使用 `arch-` 前缀
- 主题名用 kebab-case
- 例：`arch-redis-queue.md`、`arch-multi-tenant.md`

### 2. 填写 RFC 内容

按模板结构填写：

- **frontmatter**：id、status(draft)、owner、tags、created
- **背景与动机**：为什么需要变更
- **设计原则**：本 RFC 的决策原则
- **标准做法**：变更后应该怎么做
- **反模式**：什么是禁止的
- **适用范围**：影响哪些模块
- **参考**：相关文档链接

### 3. 注册到目录

更新 `docs/design-docs/index.md`：

```markdown
| `arch-{主题名}` | {主题描述} | draft | {owner} | {适用范围} | `docs/design-docs/arch-{主题名}.md` |
```

### 4. 审查循环

RFC 必须经过 `docs/guides/REVIEW.md` 三轮自审：
- R1：结构完整性
- R2：逻辑自洽性（与现有架构不冲突）
- R3：可执行性（落地路径明确）

### 5. 落地

RFC 通过后：

1. 修改 `ARCHITECTURE.md` 对应章节
2. 如涉及信条变更，修改 `core-beliefs.md`
3. 如涉及领域边界，修改 `docs/DOMAINS.md`
4. 更新 RFC frontmatter `status` 为 `verified`
5. 运行 `lint-docs.ts` 验证

### 6. 后续维护

- 每月检查 RFC 是否与实现一致
- 实现偏离时更新 RFC 或修正实现
- 30 天内未落地的 RFC 标记为 stale

## 验收标准

- [ ] RFC 文档存在于 `docs/design-docs/arch-{主题名}.md`
- [ ] 已注册到 `docs/design-docs/index.md`
- [ ] 通过三轮审查循环
- [ ] `ARCHITECTURE.md` 已同步更新
- [ ] `lint-docs.ts` 通过

## 何时不需要 RFC

- 单次需求的技术方案 → 放在 `docs/active/{slug}/design.md`
- Bug 修复 → 直接修复
- 新增不改变既有约束的模块 → 直接添加并更新 ARCHITECTURE.md
