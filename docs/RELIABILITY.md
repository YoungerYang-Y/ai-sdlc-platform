---
updated: 2026-05-14
---

# 可靠性标准

本文件定义 AI SDLC Platform 的可靠性目标和可观测性策略。

## 服务等级目标 (SLO)

**V1 目标**：
- 工作流成功率：> 80%（排除业务失败）
- 任务调度延迟：< 5s（从 ready 到 claimed）
- Artifact 存储成功率：> 99%

**V2 目标**：
- 工作流成功率：> 95%
- 任务调度延迟：< 1s
- 系统可用性：> 99.5%

## 可观测性

### 日志

**V1 范围**：
- 结构化日志（JSON 格式）
- 日志级别：DEBUG, INFO, WARN, ERROR
- 关键事件：workflow 创建、任务状态变更、artifact 保存、失败事件

**日志字段**：
```json
{
  "timestamp": "2026-05-14T21:30:00Z",
  "level": "INFO",
  "service": "orchestrator",
  "workflow_run_id": "uuid",
  "task_id": "uuid",
  "event": "task_completed",
  "message": "Task completed successfully"
}
```

### 指标 (Metrics)

**V1 范围**：
- 基础计数器（workflow 创建数、任务完成数、失败数）
- 延后到 V2 实现完整的 metrics 采集

**V2 计划**：
- Prometheus metrics
- 任务队列长度、处理延迟、成功率
- Worker 健康状态、资源使用率

### 追踪 (Tracing)

**V1 范围**：
- 无分布式追踪
- 通过 workflow_run_id 和 task_id 关联日志

**V2 计划**：
- OpenTelemetry 集成
- 端到端追踪（从提交到完成）

## 故障恢复

### 任务重试

- 最大重试次数：3 次
- 重试策略：固定延迟（V1），指数退避（V2）
- 超过重试次数后标记 workflow 为 failed

### Lease 超时回收

- Lease 默认时长：5 分钟
- 超时后自动回收并重新入队
- 迟到结果被忽略（通过 lease_token 验证）

### 数据持久化

- 所有状态变更立即写入 PostgreSQL
- 使用事务保证一致性
- 定期备份数据库（V2）

## 监控告警

**V1 范围**：
- 无自动告警
- 手动查看日志和数据库

**V2 计划**：
- 失败率超过阈值告警
- 任务队列积压告警
- Sandbox 资源耗尽告警
