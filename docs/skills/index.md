---
updated: 2026-05-16
---

# 项目级 Skills 索引

项目内高频任务的操作手册。智能体在执行对应任务前应先读取相关 skill，按步骤操作。

## 与外部 skill 的区别

- **外部 skill**（`~/.kiro/skills/`）：通用方法论，跨项目可复用
- **项目级 skill**（本目录）：绑定本项目的约束、路径和工具链，是外部 skill 在本项目的具体实例化

## Skill 清单

| Skill | 文件 | 触发场景 |
|-------|------|----------|
| 创建需求流程 | `create-requirement.md` | 收到新功能/修复请求，需要走 spec → design → plan 流程 |
| 执行实施计划 | `execute-plan.md` | plan.md 就绪，需要按任务清单逐步实施 |
| 添加新 Worker | `add-worker.md` | 平台需要新增一种 Worker 类型 |
| 架构 RFC 流程 | `architecture-rfc.md` | 需修改长期约束或依赖方向 |
| 版本归档流程 | `archive-version.md` | 一组需求完成，需要打版本归档 |

## 使用方式

智能体根据当前任务类型，在 AGENTS.md 导航到此索引，选择匹配的 skill 并按步骤执行。每个 skill 包含：

- **触发条件**：何时使用
- **前置条件**：开始前检查
- **步骤**：按序执行的操作
- **验收**：完成标准
