-- 003_approval_gate.sql
-- 人工审批门：workflow_runs 新增 rejection_reason 列

BEGIN;

ALTER TABLE workflow_runs ADD COLUMN rejection_reason TEXT;

INSERT INTO schema_migrations (version, filename) VALUES (3, '003_approval_gate.sql');

COMMIT;
