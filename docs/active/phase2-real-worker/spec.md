---
id: spec-phase2-real-worker
status: draft
owner: "evan"
tags: [phase2, delivery, worker, runtime, kiro-cli]
created: 2026-05-17
updated: 2026-05-17
---

# 产品规格：Phase 2 真实 Code Worker 集成

## 问题与动机

Phase 1 的 Worker 仅支持 mock 模式，real 模式虽然能调用 CLI 但缺少完整的工作目录管理、patch 提取和验证执行能力。平台无法真正完成一个从需求到代码修改的交付闭环。

本需求让 Code Worker 和 Review Worker 能在真实仓库上运行 Kiro CLI / Codex CLI，生成代码修改、通过验证命令、并完成审查。

## 核心决策记录

| 决策 | 选择 | 理由 |
|------|------|------|
| CLI 工具 | Kiro CLI 主力，Codex 备选 | Kiro 是主要执行引擎 |
| 工作目录模式 | 本地 + 托管两者都支持 | 本地开发用本地，CI/生产用 clone |
| 产物提取 | git diff + 保留工作目录 | patch 存 artifact，verify 直接用工作目录 |
| Verify 方式 | 可配置验收命令 | 确定性强，成本低，灵活 |
| Skill 注入 | 暂不实现 | 先跑通核心链路，后续独立优化 |
| Token 采集 | 暂不采集（0 占位） | 等 CLI 提供结构化输出再接入 |
| 工作目录生命周期 | workflow_run 级别 | code + verify 共享，结束后清理 |

## 场景

### 场景 1：托管模式（CI/生产）

1. 用户提交 `POST /workflows { repository, branch, requirement, verifyCommand }`
2. Code Worker claim code task → clone 仓库到临时目录 → 运行 Kiro CLI → git diff 提取 patch → 保存 artifact
3. Code Worker claim verify task → 在同一工作目录执行 verifyCommand → 保存日志 artifact
4. Review Worker claim review task → 加载 patch artifact → 调用 Kiro CLI 审查 → 保存报告

### 场景 2：本地模式（开发者调试）

1. 用户提交 `POST /workflows { workDir: "/path/to/repo", requirement, verifyCommand }`
2. Code Worker 直接在指定目录运行，不 clone
3. 后续流程同上

## 验收标准

- [ ] Given 一个 git 仓库 URL + requirement, When 提交 workflow, Then Code Worker clone 仓库并调用 Kiro CLI 生成代码修改
- [ ] Given Kiro CLI 执行成功, When 执行完毕, Then git diff 被提取并保存为 patch artifact
- [ ] Given code step 完成, When verify task 被 claim, Then 在同一工作目录执行 verifyCommand
- [ ] Given verifyCommand 返回 exit code 0, When verify 完成, Then task 标记 completed
- [ ] Given verifyCommand 返回非零 exit code, When verify 失败, Then attempt 标记 failed 并触发重试
- [ ] Given review task, When Review Worker claim, Then 加载前序 patch 并调用 Kiro CLI 审查
- [ ] Given 本地 workDir 模式, When 提交 workflow, Then Worker 直接在该目录执行不 clone
- [ ] Given Kiro CLI 不可用, When fallback 到 Codex, Then 使用 `codex --quiet --task` 执行
- [ ] Given workflow 结束, When 所有 task 完成或失败, Then 托管模式工作目录被清理

## 技术设计

### 新增组件：WorkspaceManager

```typescript
interface WorkspaceManager {
  // 获取或创建 workflow_run 的工作目录
  acquire(params: { workflowRunId: string; repository?: string; branch?: string; workDir?: string }): Promise<string>;
  // 重试前重置工作目录
  reset(workflowRunId: string): Promise<void>;
  // 清理工作目录
  release(workflowRunId: string): Promise<void>;
}
```

- 托管模式：`git clone --branch <branch> --depth 1 <repo> /tmp/workspaces/<workflowRunId>`
- 本地模式：直接返回 workDir，不 clone 不清理
- 重试时：`git checkout . && git clean -fd`

### CLI 调用策略

```typescript
// Kiro CLI（主力）
["kiro", "chat", "--no-interactive", "--trust-all-tools", requirement]

// Codex CLI（备选）
["codex", "--quiet", "--task", requirement]
```

选择逻辑：优先 Kiro，如果 Kiro 不在 PATH 中则 fallback 到 Codex。

### Patch 提取

```bash
git diff HEAD  # 未暂存的修改
git diff --cached  # 已暂存的修改
# 合并两者为完整 patch
```

### 工作目录传递

code 和 verify 通过 `task_run.params.workflowRunId` 共享同一 WorkspaceManager 实例。WorkspaceManager 内部维护 `Map<workflowRunId, workspacePath>`。

### workflow params 扩展

```typescript
interface WorkflowInput {
  requirement: string;
  repository?: string;  // git URL，托管模式
  branch?: string;      // 默认 "main"
  workDir?: string;     // 本地路径，本地模式
  verifyCommand?: string;  // 验收命令，如 "pnpm test"
}
```

### 文件变更范围

| 文件 | 变更 |
|------|------|
| `packages/runtime/src/index.ts` | 新增 WorkspaceManager |
| `workers/code-worker/src/index.ts` | 重写 handler，分离 code/verify 逻辑 |
| `workers/review-worker/src/index.ts` | 增强：加载前序 patch |
| `apps/orchestrator/src/index.ts` | workflow params 传递 verifyCommand |

## 异常与边界情况

| 场景 | 触发条件 | 预期行为 |
|------|----------|----------|
| Clone 失败 | 网络不可达 / 认证失败 | attempt 标记 infrastructure_error，触发重试 |
| Kiro CLI 不在 PATH | 启动时检测 | fallback 到 Codex |
| Kiro CLI 超时 | 超过 task timeout | session.execute 返回 timeout，attempt 标记 failed |
| Kiro 未产生任何修改 | git diff 为空 | attempt 标记 business_error "no changes generated" |
| verifyCommand 未指定 | params 中无 verifyCommand | verify 步骤跳过（直接 completed） |
| 工作目录被意外删除 | 外部干预 | acquire 时重新 clone |

## 产品约束

- Kiro CLI 和 Codex CLI 由宿主机提供（PATH 中可用）
- 仓库认证使用宿主机 SSH/credential（Worker 不管认证）
- 单 Worker 进程串行处理任务（Phase 1 约束继承）
- 工作目录上限由磁盘空间决定，不做配额管理

## 不包含（后续迭代）

- Skill / Harness Docs 注入
- Token / cost 精确采集
- 多仓库支持（单 workflow 涉及多个仓库）
- OpenHands / Sandbox runtime
- 并发 Worker 执行
