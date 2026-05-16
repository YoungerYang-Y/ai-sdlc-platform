-- 001_initial_schema.sql
-- Phase 1 完整数据库 Schema

BEGIN;

-- 迁移版本管理
CREATE TABLE schema_migrations (
  version     int PRIMARY KEY,
  filename    varchar(256) NOT NULL,
  applied_at  timestamptz NOT NULL DEFAULT now()
);

-- 领域：实验控制
CREATE TABLE version_sets (
  id                      uuid PRIMARY KEY,
  method_version          jsonb NOT NULL,
  execution_version       jsonb NOT NULL,
  default_weight_template varchar(64) NOT NULL DEFAULT 'default',
  created_at              timestamptz NOT NULL DEFAULT now()
);

-- 领域：工作流编排
CREATE TABLE workflow_runs (
  id                      uuid PRIMARY KEY,
  version_set_id          uuid NOT NULL REFERENCES version_sets(id),
  workflow_definition_id  varchar(128) NOT NULL DEFAULT 'default',
  status                  varchar(32) NOT NULL DEFAULT 'created',
  trigger_type            varchar(32) NOT NULL,
  trigger_ref             varchar(256),
  input                   jsonb NOT NULL,
  result                  jsonb,
  current_step_id         varchar(128),
  completed_steps         jsonb NOT NULL DEFAULT '[]',
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  finished_at             timestamptz
);

CREATE INDEX idx_workflow_runs_status ON workflow_runs(status);
CREATE INDEX idx_workflow_runs_version_set ON workflow_runs(version_set_id);
CREATE INDEX idx_workflow_runs_created_at ON workflow_runs(created_at DESC);

CREATE TABLE processed_events (
  event_id      varchar(256) PRIMARY KEY,
  processed_at  timestamptz NOT NULL DEFAULT now()
);

-- 领域：任务调度
CREATE TABLE task_runs (
  id                      uuid PRIMARY KEY,
  workflow_run_id          uuid NOT NULL REFERENCES workflow_runs(id),
  task_type               varchar(32) NOT NULL,
  status                  varchar(32) NOT NULL DEFAULT 'ready',
  priority                int NOT NULL DEFAULT 0,
  max_attempts            int NOT NULL DEFAULT 3,
  current_attempt_count   int NOT NULL DEFAULT 0,
  timeout_ms              int NOT NULL DEFAULT 300000,
  params                  jsonb,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_task_runs_claimable ON task_runs(status, priority DESC, created_at ASC)
  WHERE status = 'ready';
CREATE INDEX idx_task_runs_workflow ON task_runs(workflow_run_id);

CREATE TABLE worker_attempts (
  id                  uuid PRIMARY KEY,
  task_run_id         uuid NOT NULL REFERENCES task_runs(id),
  worker_id           varchar(128) NOT NULL,
  implementation      varchar(32) NOT NULL,
  version_set_id      uuid NOT NULL REFERENCES version_sets(id),
  status              varchar(32) NOT NULL DEFAULT 'claimed',
  attempt_number      int NOT NULL,
  lease_token         varchar(128) NOT NULL UNIQUE,
  lease_expires_at    timestamptz NOT NULL,
  last_heartbeat_at   timestamptz NOT NULL,
  started_at          timestamptz NOT NULL DEFAULT now(),
  finished_at         timestamptz,
  failure_type        varchar(64),
  failure_reason      text,
  was_orphaned        boolean NOT NULL DEFAULT false
);

CREATE INDEX idx_attempts_lease_expiry ON worker_attempts(lease_expires_at)
  WHERE status IN ('claimed', 'running');
CREATE INDEX idx_attempts_task_run ON worker_attempts(task_run_id);
CREATE INDEX idx_attempts_worker ON worker_attempts(worker_id);

-- 领域：产物管理
CREATE TABLE artifacts (
  id                uuid PRIMARY KEY,
  ref               varchar(512) NOT NULL UNIQUE,
  artifact_type     varchar(64) NOT NULL,
  workflow_run_id   uuid NOT NULL REFERENCES workflow_runs(id),
  task_run_id       uuid REFERENCES task_runs(id),
  attempt_id        uuid REFERENCES worker_attempts(id),
  filename          varchar(256) NOT NULL,
  mime_type         varchar(128) NOT NULL,
  size_bytes        bigint NOT NULL,
  storage_path      varchar(1024) NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_artifacts_workflow ON artifacts(workflow_run_id);
CREATE INDEX idx_artifacts_task ON artifacts(task_run_id);
CREATE INDEX idx_artifacts_attempt ON artifacts(attempt_id);
CREATE INDEX idx_artifacts_type ON artifacts(artifact_type);

-- 领域：观测
CREATE TABLE attempt_evidence_events (
  event_id        varchar(256) PRIMARY KEY,
  attempt_id      uuid NOT NULL REFERENCES worker_attempts(id),
  sequence_no     int NOT NULL,
  event_type      varchar(64) NOT NULL,
  occurred_at     timestamptz NOT NULL,
  payload_ref     varchar(512),
  payload_inline  jsonb,
  ingested_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_evidence_attempt_seq ON attempt_evidence_events(attempt_id, sequence_no);
CREATE INDEX idx_evidence_attempt_type ON attempt_evidence_events(attempt_id, event_type);

CREATE TABLE attempt_summary_reports (
  attempt_id        uuid PRIMARY KEY REFERENCES worker_attempts(id),
  task_run_id       uuid NOT NULL,
  worker_id         varchar(128) NOT NULL,
  version_set_id    uuid NOT NULL,
  final_status      varchar(32) NOT NULL,
  started_at        timestamptz NOT NULL,
  finished_at       timestamptz NOT NULL,
  duration_ms       int NOT NULL,
  token_totals      jsonb NOT NULL,
  cost_totals       jsonb NOT NULL,
  tool_stats        jsonb NOT NULL,
  artifact_refs     jsonb NOT NULL DEFAULT '[]',
  failure_type      varchar(64),
  failure_reason    text,
  checkpoint_digest text NOT NULL DEFAULT '',
  final_conclusion  text NOT NULL DEFAULT '',
  received_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE attempt_observability_records (
  attempt_id            uuid PRIMARY KEY REFERENCES worker_attempts(id),
  state                 varchar(32) NOT NULL DEFAULT 'collecting',
  evidence_count        int NOT NULL DEFAULT 0,
  last_evidence_at      timestamptz,
  finished_received_at  timestamptz,
  summary_received_at   timestamptz,
  was_orphaned          boolean NOT NULL DEFAULT false,
  orphaned_at           timestamptz,
  restored_at           timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_obs_records_state ON attempt_observability_records(state)
  WHERE state != 'complete';

-- 领域：评估（Phase 1 schema 预留）
CREATE TABLE attempt_scorecards (
  attempt_id          uuid PRIMARY KEY REFERENCES worker_attempts(id),
  latest_revision_id  uuid,
  state               varchar(32) NOT NULL DEFAULT 'pending',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE attempt_scorecard_revisions (
  id                      uuid PRIMARY KEY,
  attempt_id              uuid NOT NULL REFERENCES attempt_scorecards(attempt_id),
  source                  varchar(16) NOT NULL,
  trigger                 varchar(64) NOT NULL,
  weight_snapshot         jsonb NOT NULL,
  dimension_scores        jsonb NOT NULL,
  total_score             numeric(4,3) NOT NULL,
  model_or_rubric_version varchar(128) NOT NULL,
  created_by              varchar(64) NOT NULL,
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_scorecard_revisions_attempt ON attempt_scorecard_revisions(attempt_id, created_at DESC);

CREATE TABLE feedback_labels (
  id              uuid PRIMARY KEY,
  target_type     varchar(32) NOT NULL,
  target_id       uuid NOT NULL,
  reason_code     varchar(64) NOT NULL,
  created_by      varchar(64) NOT NULL,
  evidence_refs   jsonb NOT NULL DEFAULT '[]',
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_feedback_labels_target ON feedback_labels(target_type, target_id);
CREATE INDEX idx_feedback_labels_reason ON feedback_labels(reason_code);

-- 领域：实验控制（Phase 1 预留）
CREATE TABLE benchmark_cases (
  id                uuid PRIMARY KEY,
  task_type         varchar(32) NOT NULL,
  name              varchar(256) NOT NULL,
  description       text,
  input             jsonb NOT NULL,
  weight_overrides  jsonb,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- 观测 → 评估 异步桥接
CREATE TABLE pending_eval_jobs (
  id            uuid PRIMARY KEY,
  attempt_id    uuid NOT NULL REFERENCES worker_attempts(id),
  trigger       varchar(64) NOT NULL,
  status        varchar(32) NOT NULL DEFAULT 'pending',
  retries       int NOT NULL DEFAULT 0,
  max_retries   int NOT NULL DEFAULT 3,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pending_eval_jobs_status ON pending_eval_jobs(status)
  WHERE status IN ('pending', 'processing');

-- 记录迁移版本
INSERT INTO schema_migrations (version, filename) VALUES (1, '001_initial_schema.sql');

COMMIT;
