---
id: plan-phase2-real-worker
status: not-started
owner: "evan"
tags: [phase2, delivery, experiment, worker]
created: 2026-05-17
updated: 2026-05-17
---

# 计划：Phase 2 真实 Code Worker 集成

## 目标

将 Code Worker 和 Review Worker 从 mock 模式升级为真实 CLI 调用模式：实现 WorkspaceManager（clone/reset/release）、CLI Resolver（Kiro fallback Codex）、重写 code/verify handler、增强 review handler 加载前序 patch，并通过集成测试验证全链路含 observability。

## 执行模式

模式：mixed

前置任务（T1-T2）按序完成基础设施，然后 T3-T4 可并行（Code Worker 和 Review Worker 独立），最后 T5-T6 按序做集成验证。

## 任务列表

### T1: 实现 WorkspaceManager
- depends_on: []
- scope: `workers/code-worker/src/workspace.ts`
- verify: `cd workers/code-worker && pnpm test -- --grep "WorkspaceManager"`
- agent: main
- status: todo
- deliverable: `workers/code-worker/src/workspace.ts` + 单元测试

功能：
- `acquire()`：本地模式直接返回 workDir；托管模式 clone 到 `/tmp/ai-sdlc-workspaces/<workflowRunId>/`
- `reset()`：`git checkout . && git clean -fd`（恢复到 baseCommit 状态）
- `release()`：cloned 模式删除目录；local 模式不操作
- 重入幂等：acquire 同一 workflowRunId 返回已有目录（verify 步骤复用）
- 启动时孤儿清理：扫描 basePath，删除 mtime > 24h 的子目录
- repository URL 校验：必须匹配 `^(https?://|git@|ssh://)` 格式
- 所有 git/shell 命令用 spawn 数组形式

### T2: 实现 CLI Resolver
- depends_on: []
- scope: `workers/code-worker/src/cli-resolver.ts`
- verify: `cd workers/code-worker && pnpm test -- --grep "cliResolver"`
- agent: main
- status: todo
- deliverable: `workers/code-worker/src/cli-resolver.ts` + 单元测试

功能：
- `resolveCliCommand("kiro")` → 检测 `kiro` 在 PATH 中 → 返回 `["kiro", "chat", "--no-interactive", "--trust-all-tools"]`
- fallback：kiro 不可用 → 检测 `codex` → 返回 `["codex", "--quiet", "--task"]`
- 两者都不可用 → throw `Error("NO_CLI_AVAILABLE")`
- 检测方式：`spawn("which", [cmd])` 检查 exit code
- 检测时机：Worker 启动时一次性调用并缓存结果，不在每次 claim 时重复检测

### T3: 重写 Code Worker handler
- depends_on: [T1, T2]
- scope: `workers/code-worker/src/index.ts`
- verify: `cd workers/code-worker && pnpm test && pnpm typecheck`
- agent: main
- status: todo
- deliverable: `workers/code-worker/src/index.ts` 重写

变更：
- code step：acquire workspace → resolveCliCommand → spawn CLI with requirement → git diff → save patch artifact → complete
- verify step：acquire workspace（复用，不 reset） → spawn verifyCommand → save log artifact → complete/fail
- git diff 为空 → return failed("business_error", "no changes generated")
- verifyCommand 未指定 → 直接 complete
- 保留 `--mock` 开关兼容现有测试

重试语义（必须遵循）：
- **code step attempt 失败重试**：WorkspaceManager.reset() 恢复干净状态 → 重新运行 CLI（新 attempt 全新生成代码）
- **verify step 失败**：不 reset 工作目录（验证的是 code 产出），由 Orchestrator onFailure 策略决定 workflow 行为（当前为 abort）

### T4: 增强 Review Worker handler
- depends_on: [T1, T2]
- scope: `workers/review-worker/src/index.ts`
- verify: `cd workers/review-worker && pnpm test && pnpm typecheck`
- agent: main
- status: todo
- deliverable: `workers/review-worker/src/index.ts` 修改 + 单元测试

变更：
- 从 Artifact Store 加载同 workflow_run 的 patch artifact（按 artifactType="patch" 查询）
- patch 传入方式：将 patch 内容写入临时文件，通过 prompt 中引用文件路径传给 Kiro CLI
- 保留 `--mock` 开关

### T5: Orchestrator 传递 workflow input 到 task params
- depends_on: []
- scope: `apps/orchestrator/src/index.ts`
- verify: `cd apps/orchestrator && pnpm typecheck`
- agent: main
- status: todo
- deliverable: `apps/orchestrator/src/index.ts` 修改

变更：
- `advanceWorkflow` 中 submitTask 时将 workflow input 的 repository/branch/workDir/verifyCommand 传入 task params
- `POST /workflows` 输入校验扩展：repository 或 workDir 至少提供一个

### T6: 集成测试
- depends_on: [T3, T4, T5]
- scope: `tests/e2e-real.test.ts`, `workers/code-worker/tests/`, `tests/fixtures/mock-cli.sh`
- verify: `pnpm test`
- agent: main
- status: todo
- deliverable: 集成测试通过

内容：
- Mock CLI 脚本：`tests/fixtures/mock-cli.sh` — 接收 requirement 参数，向仓库写入固定文件修改（如 `echo "hello" > output.txt`），exit 0。通过 PATH 优先级或 CLI Resolver 注入使 Worker 使用该脚本
- Code Worker 集成测试：用真实 git 仓库（`git init` 临时仓库）+ mock-cli.sh 验证全链路
- 工作目录清理断言：verify workflow 结束后，WorkspaceManager.release() 被调用，临时目录已删除
- 验证 observability 链路：evidence + summary + scorecard 在非 mock handler 下正常生成
- 可选 E2E（`RUN_REAL_E2E=true`）：调用真实 Kiro CLI

## 决策日志

- 2026-05-17 — WorkspaceManager 和 CLI Resolver 放在 `workers/code-worker/src/` 而非 design.md 初始提议的 `packages/runtime/src/` — Runtime 模块职责是进程执行抽象，不应耦合 git 仓库管理；WorkspaceManager 是 Code Worker 特有的执行策略。design.md 已同步修正路径。

## 风险与阻塞

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| Kiro CLI 在开发环境不可用 | 中 | fallback 到 codex；集成测试使用 mock CLI 脚本 |
| git clone 认证在 CI 中不工作 | 低 | 集成测试使用本地 git init 仓库，不依赖远程 |
| Worker 进程重启后 WorkspaceManager 状态丢失 | 低 | acquire 幂等设计——检测目录存在则复用，不存在则重新 clone |
| verifyCommand 执行时间不确定 | 中 | 继承 task_run.timeoutMs 作为命令超时 |

## 完成标准

- [ ] 所有任务 status = done
- [ ] `pnpm typecheck` 全通过
- [ ] `pnpm test` 全通过（含新增测试）
- [ ] 使用 mock CLI 的集成测试验证 code → verify → review 全链路
- [ ] observability + scorecard 在真实 handler 下正常生成
- [ ] design-doc status 更新为 verified
- [ ] 剩余债务已记录到 `tech-debt-tracker.md`
