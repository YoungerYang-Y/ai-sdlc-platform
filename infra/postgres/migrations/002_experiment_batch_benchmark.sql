-- 002_experiment_batch_benchmark.sql
-- 实验批次调度 + Benchmark 管理

BEGIN;

INSERT INTO schema_migrations (version, filename) VALUES (2, '002_experiment_batch_benchmark.sql');

-- Benchmark 管理
CREATE TABLE benchmark_suites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE benchmark_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  suite_id UUID NOT NULL REFERENCES benchmark_suites(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  input JSONB NOT NULL,
  source_workflow_run_id UUID REFERENCES workflow_runs(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_benchmark_cases_suite ON benchmark_cases(suite_id);

-- 实验批次
CREATE TABLE experiment_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  suite_id UUID NOT NULL REFERENCES benchmark_suites(id),
  version_set_ids JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  total_runs INT NOT NULL DEFAULT 0,
  completed_runs INT NOT NULL DEFAULT 0,
  failed_runs INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);

CREATE TABLE experiment_batch_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES experiment_batches(id) ON DELETE CASCADE,
  benchmark_case_id UUID NOT NULL REFERENCES benchmark_cases(id),
  version_set_id UUID NOT NULL,
  workflow_run_id UUID NOT NULL REFERENCES workflow_runs(id),
  UNIQUE(batch_id, benchmark_case_id, version_set_id)
);

CREATE INDEX idx_batch_runs_batch ON experiment_batch_runs(batch_id);
CREATE INDEX idx_batch_runs_workflow ON experiment_batch_runs(workflow_run_id);

-- Run 级聚合评分
CREATE TABLE run_scorecards (
  workflow_run_id UUID PRIMARY KEY REFERENCES workflow_runs(id),
  dimension_scores JSONB NOT NULL,
  total_score NUMERIC(5,4) NOT NULL,
  source_attempt_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMIT;
