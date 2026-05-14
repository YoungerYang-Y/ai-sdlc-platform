# 自动生成文档注册表

本目录下的文档由智能体从项目源码自动生成，**禁止手动编辑**。

智能体在 bootstrap（Scenario 1）和 gardening（Scenario 3）时，按此表逐项扫描源码并生成/更新对应文档。每个文档必须包含 `最后生成: YYYY-MM-DD` 时间戳头，gardening 脚本据此检测过期（> 30 天）。

## 注册表

以下为参考条目，bootstrap 时按项目实际数据源按需保留或删除。

| 文档 | 数据源 | 提取方式 | 触发时机 |
|------|--------|----------|----------|
| `db-schema.md` | ORM 模型 / migration 文件 / DDL | 扫描 entity/model 定义，提取表名、字段、类型、关系 | bootstrap + schema 变更后 |
| `api-routes.md` | 路由定义（controller / router 文件） | 扫描路由注册，提取 method、path、handler、中间件 | bootstrap + 路由变更后 |
| `module-dependencies.md` | import/require 语句 + 目录结构 | 分析模块间依赖方向，生成 Mermaid 依赖图 | bootstrap + 月度 gardening |
| `env-config.md` | `.env.example` / config 文件 / 环境变量引用 | 提取配置项名、类型、默认值、是否必填 | bootstrap + 配置变更后 |
| `error-codes.md` | 错误码定义（enum / constants / 异常类） | 提取错误码、HTTP 状态码、描述、使用位置 | bootstrap + 错误码变更后 |
| `kafka-topics.md` | producer/consumer 定义 | 扫描 topic 声明、消息 schema、消费者组 | bootstrap + topic 变更后 |
| `es-index-mappings.md` | ES index 定义 / mapping 文件 | 提取 index 名、字段映射、分析器配置 | bootstrap + mapping 变更后 |
| `scheduled-jobs.md` | cron 定义 / @Scheduled / 定时任务注册 | 提取任务名、cron 表达式、执行逻辑摘要 | bootstrap + 定时任务变更后 |
| `middleware-chain.md` | 中间件/拦截器/过滤器注册 | 提取注册顺序、每层职责、适用路径 | bootstrap + 中间件变更后 |
| `feature-flags.md` | feature flag 定义 / SDK 调用点 | 提取 flag 名、默认值、控制的功能范围 | bootstrap + flag 变更后 |
| `grpc-services.md` | protobuf 定义 | 提取 service、method、request/response 类型 | bootstrap + proto 变更后 |
| `graphql-schema.md` | GraphQL SDL / schema 文件 | 提取 type、query、mutation、subscription | bootstrap + schema 变更后 |

## 如何添加新的生成文档

1. 在上方注册表中添加一行（文档名、数据源、提取方式、触发时机）
2. 生成时以 `_template.md` 为骨架：必须包含 `最后生成: YYYY-MM-DD` 时间戳头和 `数据源:` 声明
3. 智能体下次 gardening 时会按注册表生成

## 如何判断是否需要生成

- 项目中不存在对应数据源 → 跳过，不生成该文档
- 数据源存在但文档不存在 → 生成
- 文档存在但过期（> 30 天）→ 重新生成
- 数据源不再存在 → 删除对应文档，从注册表移除
