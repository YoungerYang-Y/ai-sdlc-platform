#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

echo "=== 启动 PostgreSQL ==="
docker compose -f infra/docker/docker-compose.dev.yml up -d

echo "=== 等待数据库就绪 ==="
until docker exec docker-postgres-1 pg_isready -U dev -d ai_sdlc > /dev/null 2>&1; do
  sleep 1
done

echo "=== 执行迁移 ==="
bash scripts/migrate.sh

echo "=== 导入种子数据 ==="
SEED=1 bash scripts/migrate.sh

echo "=== 安装依赖 ==="
pnpm install

echo "✓ 开发环境就绪"
echo "  启动服务: npx tsx apps/orchestrator/src/main.ts"
echo "  启动 Worker: npx tsx workers/code-worker/src/index.ts --mock"
