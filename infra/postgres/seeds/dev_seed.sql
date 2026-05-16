-- dev_seed.sql
-- 开发环境初始数据

-- 默认 version_set（用于 Phase 1 开发测试）
INSERT INTO version_sets (id, method_version, execution_version) VALUES
(
  '00000000-0000-0000-0000-000000000001',
  '{"skills": "v1", "harness_docs": "v1", "prompt": "default"}',
  '{"worker": "codex", "model": "gpt-4o", "runtime": "cli"}'
),
(
  '00000000-0000-0000-0000-000000000002',
  '{"skills": "v1", "harness_docs": "v1", "prompt": "default"}',
  '{"worker": "claude-code", "model": "claude-sonnet-4", "runtime": "cli"}'
);
