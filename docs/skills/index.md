# 项目内基础 Skills

本目录保存面向智能体的项目内基础 skill。它使用标准 skill 目录结构：每个 skill 是一个目录，目录内必须有 `SKILL.md`，并包含 YAML frontmatter 的 `name` 和 `description`。

## 使用规则

1. 先读 `AGENTS.md`，再根据任务类型选择本目录下的 skill。
2. 只读取与当前任务相关的 skill，避免把普通方法论文档复制成重复 skill。
3. 如果 skill 与 `ARCHITECTURE.md`、`docs/guides/*` 冲突，以长期约束和方法论文档为准，并记录漂移。
4. 修改这些 skill 时，同步更新本索引和 `AGENTS.md` 导航。

## Skill 索引

| skill | 何时使用 | 文件 |
|-------|----------|------|
| Quality Gate | 准备交付、提交、声称完成，或需要确认验证范围 | `docs/skills/quality-gate/SKILL.md` |

## 维护约束

- 每个 skill 必须保留 `SKILL.md` 文件名和 frontmatter。
- 每个 skill 保持短小，优先给行动步骤和入口链接。
- 不复制长篇方法论；详细规则链接到 `docs/guides/` 或长期约束文档。
- 只有具备明确触发点、且不能被 `AGENTS.md` / `docs/guides/*` 充分覆盖的流程，才应新增 skill。
