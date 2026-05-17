---
id: spec-phase2-real-worker
status: shipped
owner: "evan"
tags: [phase2, delivery, experiment, worker, kiro-cli]
created: 2026-05-17
updated: 2026-05-17
---

# 产品规格：Phase 2 真实 Code Worker 集成

## 问题与动机

Phase 1 的 Worker 仅支持 mock 模式，平台无法真正完成从需求到代码修改的交付闭环。用户提交一个需求后，期望看到真实的代码修改、通过验证、得到 AI 审查报告，最终以 Pull Request 形式交付——当前做不到。

同时，实验侧需要能在真实执行中产生有意义的观测数据（执行时长、成功率、产物质量），才能在不同配置之间做有效比较。Mock 模式产出的评分无法反映真实性能。

## 功能边界

### In Scope

- Code Worker 在真实仓库上调用 AI CLI 生成代码修改
- 从修改后的仓库中提取代码变更作为 patch 产物
- Verify 步骤在修改后的工作目录执行用户指定的验收命令
- Review Worker 加载前序 patch 产物并调用 AI CLI 进行审查
- 交付模式下 review 通过后自动 commit + push + 创建 Pull Request
- 支持两种仓库模式：本地目录 / 远程 clone
- CLI 降级：主力 CLI 不可用时自动降级到备选 CLI
- 工作目录在 workflow 生命周期内共享，结束后清理
- 真实执行下 observability 链路继续工作（evidence + summary + scorecard）

### Out of Scope

- Skill / Harness Docs 注入（后续独立需求）
- Token / cost 精确采集（等 CLI 提供结构化输出）
- 多仓库支持（单 workflow 涉及多个仓库）
- OpenHands / Sandbox runtime
- 并发 Worker 执行
- 仓库认证管理（使用宿主机已有认证）
- Phase 2 实验侧批量能力（benchmark batch、experiment 管理）→ 独立 spec
- GitLab / 其他平台 MR 支持（仅 GitHub PR）

## 用户场景

### 场景 1：托管模式完整交付（含 PR）

1. 用户提交需求，指定远程仓库 URL、分支和验收命令
2. 系统 clone 仓库，调用 AI CLI 执行代码修改
3. 系统提取 patch 并保存
4. 系统在修改后的代码上运行验收命令
5. 验收通过后，系统调用 AI CLI 审查 patch
6. 审查通过后，系统 commit 修改、push 到新分支、创建 Pull Request
7. 用户获得最终状态：completed + patch 产物 + 审查报告 + PR 链接

### 场景 2：本地模式开发调试

1. 用户指定本地仓库路径和需求
2. 系统直接在该目录运行 AI CLI
3. 验证和审查同场景 1
4. 本地模式不 clone、不 push、不创建 PR（修改保留在工作目录中）

### 场景 3：实验模式（不创建 PR）

1. 用户以实验模式（trigger_type=experiment）提交需求
2. 系统正常执行 code → verify → review
3. 全链路产出 evidence、summary、scorecard
4. 不 push、不创建 PR（避免污染仓库）
5. Patch 仅保存为 artifact

### 场景 4：CLI 不可用降级

1. 用户提交需求，系统发现主力 CLI 不在 PATH 中
2. 系统自动降级到备选 CLI 执行
3. 后续流程不变，用户可从 evidence 事件中看到实际使用的 CLI

### 场景 5：Code 步骤失败重试

1. AI CLI 执行失败（超时或异常退出）
2. Attempt 标记 failed，Scheduler 按 maxAttempts 触发重试
3. 重试时工作目录恢复到干净状态，全新执行 AI CLI

### 场景 6：验收失败

1. Code 步骤成功生成修改
2. Verify 步骤运行验收命令，返回非零 exit code
3. Verify attempt 标记 failed
4. 当前行为：workflow 标记 failed（后续可扩展为回退到 code 步骤重试）

### 场景 7：验收命令未指定

1. 用户提交需求时未提供验收命令
2. Verify 步骤直接标记 completed，跳过实际验证
3. 流程继续进入 review 步骤

### 场景 8：实验对比——不同 CLI 配置

1. 用户用 version_set A（implementation=kiro）跑一个需求
2. 用户用 version_set B（implementation=codex）跑同一个需求
3. 两个 attempt 各自产出 evidence、summary 和 scorecard
4. 用户可比较两者的成功率、执行时长和产物差异

## 输入与输出

### 用户输入

- 需求描述（自然语言）
- 仓库来源（远程 URL + 分支 或 本地路径，二选一）
- 验收命令（可选，如 `pnpm test && pnpm typecheck`）
- 触发类型（manual / experiment）

### 用户可见输出

- Workflow 状态（running → completed / failed）
- Patch 产物（代码修改的 diff）
- 验证日志（验收命令的 stdout/stderr）
- 审查报告（AI 生成的 review 文本）
- Pull Request 链接（仅交付模式 + 托管模式）
- Attempt 级观测数据（执行时长、成功/失败、证据事件、使用的 CLI 名称）
- Scorecard（基于真实执行的评分）

## 验收标准

### 交付侧

- [ ] Given 一个 git 仓库 URL + requirement, When 提交 workflow, Then 系统 clone 仓库并调用 AI CLI 生成代码修改
- [ ] Given AI CLI 执行成功且有文件修改, When 执行完毕, Then 代码变更被提取并保存为 patch artifact
- [ ] Given AI CLI 执行成功但无文件修改, When 变更为空, Then attempt 标记 failed（business_error）
- [ ] Given code step 完成, When verify task 执行, Then 在同一工作目录（含 code 修改）运行验收命令
- [ ] Given verifyCommand 返回 exit code 0, When verify 完成, Then task 标记 completed
- [ ] Given verifyCommand 返回非零 exit code, When verify 失败, Then attempt 标记 failed
- [ ] Given 未指定 verifyCommand, When verify task 执行, Then 直接标记 completed（跳过验证）
- [ ] Given review task, When Review Worker 执行, Then 加载前序 patch 内容并调用 AI CLI 产出审查报告
- [ ] Given 本地 workDir 模式, When 提交 workflow, Then 系统直接在该目录执行不 clone 不 push
- [ ] Given 主力 CLI 不在 PATH, When 降级到备选 CLI, Then 使用备选 CLI 执行并正常完成流程
- [ ] Given workflow 结束（completed 或 failed）, When 托管模式, Then 工作目录被清理

### PR 交付

- [ ] Given 交付模式 + 托管模式 + review 通过, When workflow completed, Then 修改被 commit + push 到新分支并创建 PR
- [ ] Given PR 创建成功, When workflow 结果返回, Then 包含 PR 的 URL
- [ ] Given 实验模式, When workflow completed, Then 不 push 不创建 PR
- [ ] Given 本地模式, When workflow completed, Then 不 push 不创建 PR
- [ ] Given gh CLI 不可用, When 尝试创建 PR, Then workflow 仍标记 completed（PR 创建为 best-effort），记录警告

### 实验侧

- [ ] Given 真实 CLI 执行, When attempt 完成, Then evidence 事件包含真实的 tool_called（含 CLI 名称和 durationMs）
- [ ] Given 真实执行完成, When summary 上报, Then durationMs 反映真实执行耗时
- [ ] Given 真实执行的 observability complete, When evaluation 触发, Then scorecard 基于真实数据生成
- [ ] Given 同一需求用不同 implementation 执行, When 两个 attempt 都完成, Then 两个 scorecard 可用于比较

### Observability 链路

- [ ] Given 真实 CLI 执行完毕, When evidence 和 summary 都上报, Then observability 状态进入 complete 并生成 scorecard
- [ ] Given attempt_finished 通知, When Scheduler 完成/失败, Then Observability 收到通知
- [ ] Given observability complete, When eval trigger, Then pending_eval_job 被创建、消费并生成 attempt_scorecard

## 异常与边界情况

| 场景 | 触发条件 | 预期行为 |
|------|----------|----------|
| Clone 失败 | 网络不可达 / 认证失败 | attempt 标记 infrastructure_error，触发重试 |
| AI CLI 超时 | 超过 task timeout | attempt 标记 failed |
| AI CLI 崩溃 | 非零退出码 | attempt 标记 failed |
| 所有 CLI 都不可用 | 均不在 PATH | attempt 标记 infrastructure_error，不重试 |
| 验收命令不存在 | 命令无法执行 | attempt 标记 infrastructure_error |
| 工作目录被意外删除 | 外部干预 | 重新 clone 或报错 |
| Code step 重试 | 前次 attempt failed | 工作目录恢复干净状态后全新执行 |
| Verify step 失败 | 验收命令返回非零 | 保留代码修改（不恢复），workflow 按策略处理 |
| Push 失败 | 权限不足 / 网络问题 | workflow 仍标记 completed，PR 创建标记为降级，记录警告 |
| gh CLI 不可用 | 不在 PATH | 同上，PR 创建为 best-effort |
| PR 创建冲突 | 同名分支已存在 | 使用带时间戳的分支名重试一次 |

## 产品约束

- AI CLI 和 gh CLI 由宿主机提供，平台不负责安装
- 仓库认证使用宿主机 SSH / credential helper / gh auth
- 单 Worker 进程串行处理任务
- 工作目录生命周期与 workflow_run 绑定
- PR 创建为 best-effort：失败不阻塞 workflow 完成
- observability 链路行为与 Phase 1 一致，真实执行不改变上报协议

## 度量

- 真实 CLI 调用成功率 > 80%（排除需求本身不合理的情况）
- 全链路（code → verify → review）端到端完成率 > 50%
- PR 创建成功率 > 95%（排除认证问题）
- Scorecard 生成率 = 100%（所有完成的 attempt 都有 scorecard）
