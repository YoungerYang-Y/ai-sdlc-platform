# 设计决策目录

项目级通用设计决策。每个文档定义一个跨功能的设计主题（如缓存策略、幂等设计），智能体在相关领域编码前应先查阅。

| id | 主题 | status | owner | 适用范围 | 路径 |
|----|------|--------|-------|----------|------|
| `arch-dual-track-roadmap` | 双轨演进路线 | draft | evan | 路线图、核心对象模型、实验平台演进 | `docs/design-docs/arch-dual-track-roadmap.md` |
| `arch-attempt-observability-evaluation` | Worker Attempt 观测与评估架构 | draft | evan | attempt 协议、观测状态机、评分与标签传播 | `docs/design-docs/arch-attempt-observability-evaluation.md` |
| `worker-sdk` | Worker SDK 协议设计 | draft | evan | Worker 身份模型、执行协议、观测协议、框架循环 | `docs/design-docs/worker-sdk.md` |

## status 含义

- **draft**：设计尚未落地。智能体可参考但需注意细节可能变化。
- **verified**：设计与实现一致。智能体应严格遵守。
- **stale**：实现已偏离设计。智能体不应信赖细节，需先更新。

## 何时创建 design-doc

- 需要修改 `ARCHITECTURE.md` 或 `core-beliefs.md` 中的长期约束时，先创建 `arch-` 前缀的 design-doc 作为架构 RFC
- 发现跨多个需求的通用设计问题时（如缓存策略、幂等设计、错误码规范）
- 实施过程中需要违反现有依赖方向或架构约束时，暂停实施，先创建架构 RFC

**不要用 design-doc 替代需求目录中的 design.md**——需求级的设计放在 `docs/active/{需求}/design.md`，项目级的通用决策放在这里。

## 如何添加

1. 复制 `_template.md` 为 `{主题名}.md`（如 `cache-strategy.md`；架构 RFC 用 `arch-` 前缀）
2. 填写 frontmatter 和所有章节
3. 在上方目录表中添加条目
4. status 设为 draft；落地验证后更新为 verified
