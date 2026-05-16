---
updated: 2026-05-16
---

# Skill: 添加新 Worker

## 触发条件

- 平台需要新增一种 Worker 类型（如 claude-worker、test-worker）
- 需要扩展现有 Worker 的能力到新场景

## 前置条件

- [ ] 已读 `ARCHITECTURE.md` 理解 Worker 在分层中的位置
- [ ] 已读 `packages/worker-sdk/` 了解 SDK 协议
- [ ] 已确认新 Worker 的职责边界不与现有 Worker 重叠
- [ ] 已创建对应的需求文档（走 `create-requirement.md` 流程）

## 步骤

### 1. 创建 Worker 目录

```
workers/{worker-name}/
├── README.md
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts          # 入口
│   ├── worker.ts         # Worker 实现
│   └── config.ts         # 配置
└── tests/
    └── worker.test.ts
```

### 2. 配置 package.json

```json
{
  "name": "@ai-sdlc/{worker-name}",
  "private": true,
  "dependencies": {
    "@ai-sdlc/worker-sdk": "workspace:*",
    "@ai-sdlc/runtime": "workspace:*",
    "@ai-sdlc/artifact": "workspace:*"
  }
}
```

### 3. 实现 Worker

Worker 必须遵循 SDK 协议：

1. 通过 `worker-sdk` 注册自身类型
2. 实现 claim → execute → report 循环
3. 产生 `worker_attempt` 并上报证据
4. 通过 `artifact` 保存产物

依赖方向（必须遵守）：
```
Worker → worker-sdk → (无外部依赖)
Worker → runtime → (无外部依赖)
Worker → artifact → (无外部依赖)
Worker ✗ orchestrator (禁止)
Worker ✗ scheduler (禁止直接依赖)
```

### 4. 注册到 Scheduler

在 Scheduler 配置中注册新 Worker 类型，使其可被调度：
- 声明支持的 task_type
- 配置 lease 参数
- 配置重试策略

### 5. 更新文档

- [ ] `ARCHITECTURE.md`：在模块映射表和架构图中添加新 Worker
- [ ] `docs/DOMAINS.md`：确认 Worker 属于"Worker 执行"领域
- [ ] 新 Worker 的 `README.md`：描述职责和使用方式

### 6. 验证

```bash
pnpm build
pnpm test
pnpm typecheck
```

确认：
- Worker 可编译
- SDK 协议测试通过
- 不引入循环依赖

## 验收标准

- [ ] Worker 目录结构完整
- [ ] 遵循 SDK 协议，可被 Scheduler 调度
- [ ] 依赖方向正确（不依赖 orchestrator/scheduler）
- [ ] 单元测试覆盖核心逻辑
- [ ] 文档已同步更新
- [ ] `pnpm build && pnpm test` 通过

## 检查清单

- Worker 是否产生 `worker_attempt`？
- Worker 是否通过 `artifact` 保存产物？
- Worker 是否支持 heartbeat（长时任务）？
- Worker 是否正确处理 lease 过期？
- Worker 是否上报观测证据（context / reasoning / tool / token）？
