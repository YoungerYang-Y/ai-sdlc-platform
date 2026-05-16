---
updated: 2026-05-16
---

# Skill: 版本归档流程

## 触发条件

- 一组需求全部完成（plan status = completed）
- 人工决定打版本发布

## 前置条件

- [ ] 人工提供版本号（如 `v1.0.0`）
- [ ] 待归档需求的 plan.md 所有任务 status = done
- [ ] 待归档需求的 design.md status = verified

## 步骤

### 1. 识别待归档需求

扫描 `docs/active/` 目录，找出所有 plan status = completed 的需求：

```bash
grep -rl "status: completed" docs/active/*/plan.md
```

### 2. 创建版本目录

```bash
mkdir -p docs/archive/{version}
cp docs/archive/_release-template.md docs/archive/{version}/release.md
```

### 3. 填写 release.md

按模板填写：

- **frontmatter**：version、date、retain_until（+12 个月）、previous_version
- **版本摘要**：一段话描述核心变更
- **需求表**：slug、摘要、变更类型、影响模块
- **变更范围**：接口变更、数据变更、依赖变更
- **发布与回滚**：从各需求的 design.md 聚合
- **关键决策**：从各需求的 plan.md 决策日志提取
- **已知问题**：从各需求的 plan.md 未解决项提取

### 4. 迁移需求目录

```bash
# 复制到归档目录
cp -r docs/active/{slug} docs/archive/{version}/{slug}

# 从活跃目录删除
rm -rf docs/active/{slug}
```

对每个待归档需求重复此操作。

### 5. 更新索引

**`docs/active/index.md`**：移除已归档条目

**`docs/archive/index.md`**：添加新版本条目：

```markdown
| {version} | {date} | {需求数} | {摘要} |
```

**前一版本**：如有，更新其 release.md 的 `next_version` 字段

### 6. 登记遗留债务

未解决的问题和遗留项登记到 `docs/active/tech-debt-tracker.md`。

### 7. 验证

```bash
node "$HARNESS_ENGINEERING_SKILL_DIR/scripts/lint-docs.ts"
```

确认：
- 归档目录结构正确
- 活跃索引无悬空引用
- 归档索引完整

## 验收标准

- [ ] `docs/archive/{version}/` 目录存在且包含 release.md
- [ ] 所有待归档需求已移动到归档目录
- [ ] `docs/active/index.md` 不再包含已归档条目
- [ ] `docs/archive/index.md` 包含新版本条目
- [ ] 遗留项已登记到 tech-debt-tracker.md
- [ ] `lint-docs.ts` 通过

## 注意事项

- 归档后的文档禁止修改（只读快照）
- retain_until 到期后可考虑删除（默认保留 12 个月）
- 版本号遵循 SemVer
