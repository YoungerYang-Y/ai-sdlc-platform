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
)
ON CONFLICT (id) DO NOTHING;

-- 示例 benchmark suite（用于开发测试和集成测试）
INSERT INTO benchmark_suites (id, name, description) VALUES
(
  '00000000-0000-0000-0000-000000000010',
  '基础任务集',
  '用于开发测试的基础 benchmark 样本'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO benchmark_cases (id, suite_id, name, input) VALUES
(
  '00000000-0000-0000-0000-000000000011',
  '00000000-0000-0000-0000-000000000010',
  'hello-world API',
  '{"requirement": "创建一个返回 hello world 的 REST API 端点"}'
),
(
  '00000000-0000-0000-0000-000000000012',
  '00000000-0000-0000-0000-000000000010',
  '添加单元测试',
  '{"requirement": "为 utils.ts 中的 formatDate 函数添加单元测试"}'
)
ON CONFLICT (id) DO NOTHING;
