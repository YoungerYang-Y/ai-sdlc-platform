import postgres from "postgres";
import type { TaskRun, WorkerAttempt, TaskType, FailureType } from "@ai-sdlc/worker-sdk";

// 联合类型允许 SchedulerRepository 同时接受普通连接和事务连接。
// 内部仅使用 tagged template query（两者都支持）；.begin() 等方法仅在 createSql() 返回的 postgres.Sql 上可用。
export type Sql = postgres.Sql | postgres.TransactionSql;

export function createSql(connectionString: string): postgres.Sql {
  return postgres(connectionString);
}

/** 仅供 SchedulerRepository 内部使用，启用 camelCase 自动转换 */
export function createCamelSql(connectionString: string): postgres.Sql {
  return postgres(connectionString, {
    transform: postgres.camel,
  });
}

export class SchedulerRepository {
  constructor(private sql: Sql) {}

  async findAndLockReadyTask(taskTypes: TaskType[]): Promise<TaskRun | null> {
    const rows = await this.sql`
      SELECT * FROM task_runs
      WHERE status = 'ready'
        AND task_type = ANY(${taskTypes})
      ORDER BY priority DESC, created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `;
    return rows[0] ? this.mapTaskRun(rows[0]) : null;
  }

  async updateTaskStatus(id: string, status: string): Promise<void> {
    await this.sql`
      UPDATE task_runs SET status = ${status}, updated_at = now() WHERE id = ${id}
    `;
  }

  async createAttempt(params: {
    taskRunId: string;
    workerId: string;
    implementation: string;
    versionSetId: string;
    attemptNumber: number;
    leaseToken: string;
    leaseExpiresAt: Date;
  }): Promise<WorkerAttempt> {
    const [row] = await this.sql`
      INSERT INTO worker_attempts (id, task_run_id, worker_id, implementation, version_set_id, status, attempt_number, lease_token, lease_expires_at, last_heartbeat_at)
      VALUES (gen_random_uuid(), ${params.taskRunId}, ${params.workerId}, ${params.implementation}, ${params.versionSetId}, 'claimed', ${params.attemptNumber}, ${params.leaseToken}, ${params.leaseExpiresAt}, now())
      RETURNING *
    `;
    return this.mapAttempt(row!);
  }

  async incrementAttemptCount(taskRunId: string): Promise<void> {
    await this.sql`
      UPDATE task_runs SET current_attempt_count = current_attempt_count + 1, updated_at = now()
      WHERE id = ${taskRunId}
    `;
  }

  async findAttempt(attemptId: string): Promise<WorkerAttempt | null> {
    const [row] = await this.sql`SELECT * FROM worker_attempts WHERE id = ${attemptId}`;
    return row ? this.mapAttempt(row) : null;
  }

  async findTaskRun(taskRunId: string): Promise<TaskRun | null> {
    const [row] = await this.sql`SELECT * FROM task_runs WHERE id = ${taskRunId}`;
    return row ? this.mapTaskRun(row) : null;
  }

  async updateAttemptStatus(id: string, status: string, extra?: { failureType?: string; failureReason?: string }): Promise<void> {
    await this.sql`
      UPDATE worker_attempts
      SET status = ${status},
          finished_at = CASE WHEN ${status} IN ('completed','failed','expired') THEN now() ELSE finished_at END,
          failure_type = COALESCE(${extra?.failureType ?? null}, failure_type),
          failure_reason = COALESCE(${extra?.failureReason ?? null}, failure_reason)
      WHERE id = ${id}
    `;
  }

  async renewLease(attemptId: string, leaseToken: string, newExpiry: Date): Promise<boolean> {
    const result = await this.sql`
      UPDATE worker_attempts
      SET lease_expires_at = ${newExpiry}, last_heartbeat_at = now()
      WHERE id = ${attemptId} AND lease_token = ${leaseToken} AND status IN ('claimed', 'running')
      RETURNING id
    `;
    return result.length > 0;
  }

  async setAttemptRunning(attemptId: string): Promise<void> {
    await this.sql`
      UPDATE worker_attempts SET status = 'running' WHERE id = ${attemptId} AND status = 'claimed'
    `;
  }

  async findExpiredAttempts(): Promise<WorkerAttempt[]> {
    const rows = await this.sql`
      SELECT * FROM worker_attempts
      WHERE status IN ('claimed', 'running') AND lease_expires_at < now()
      LIMIT 20
    `;
    return rows.map((r) => this.mapAttempt(r));
  }

  async createTaskRun(params: {
    workflowRunId: string;
    taskType: TaskType;
    maxAttempts: number;
    timeoutMs: number;
    params?: Record<string, unknown>;
  }): Promise<TaskRun> {
    const [row] = await this.sql`
      INSERT INTO task_runs (id, workflow_run_id, task_type, max_attempts, timeout_ms, params)
      VALUES (gen_random_uuid(), ${params.workflowRunId}, ${params.taskType}, ${params.maxAttempts}, ${params.timeoutMs}, ${this.sql.json(params.params as any ?? null)})
      RETURNING *
    `;
    return this.mapTaskRun(row!);
  }

  async listTasksByWorkflow(workflowRunId: string): Promise<TaskRun[]> {
    const rows = await this.sql`SELECT * FROM task_runs WHERE workflow_run_id = ${workflowRunId} ORDER BY created_at`;
    return rows.map((r) => this.mapTaskRun(r));
  }

  private mapTaskRun(row: any): TaskRun {
    return {
      ...row,
      createdAt: row.createdAt?.toISOString?.() ?? row.createdAt,
      updatedAt: row.updatedAt?.toISOString?.() ?? row.updatedAt,
    };
  }

  private mapAttempt(row: any): WorkerAttempt {
    return {
      ...row,
      leaseExpiresAt: row.leaseExpiresAt?.toISOString?.() ?? row.leaseExpiresAt,
      lastHeartbeatAt: row.lastHeartbeatAt?.toISOString?.() ?? row.lastHeartbeatAt,
      startedAt: row.startedAt?.toISOString?.() ?? row.startedAt,
      finishedAt: row.finishedAt?.toISOString?.() ?? row.finishedAt,
    };
  }
}
