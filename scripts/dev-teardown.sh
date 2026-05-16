#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

echo "=== 停止服务进程 ==="
fuser -k 8000/tcp 8002/tcp 2>/dev/null || true

echo "=== 停止 PostgreSQL ==="
docker compose -f infra/docker/docker-compose.dev.yml down

echo "✓ 清理完成"
