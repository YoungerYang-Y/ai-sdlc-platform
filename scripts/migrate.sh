#!/usr/bin/env bash
set -euo pipefail

DB_URL="${DATABASE_URL:-postgresql://dev:dev@localhost:5432/ai_sdlc}"
MIGRATIONS_DIR="$(dirname "$0")/../infra/postgres/migrations"

echo "Running migrations against: $DB_URL"

for migration in "$MIGRATIONS_DIR"/*.sql; do
  filename=$(basename "$migration")
  version=$(echo "$filename" | grep -oP '^\d+')

  already_applied=$(psql "$DB_URL" -tAc \
    "SELECT 1 FROM schema_migrations WHERE version = $version" 2>/dev/null || echo "")

  if [ "$already_applied" = "1" ]; then
    echo "  skip: $filename (already applied)"
  else
    echo "  apply: $filename"
    psql "$DB_URL" -f "$migration"
  fi
done

echo "Migrations complete."

# 可选：运行 seed
if [ "${SEED:-}" = "1" ]; then
  SEEDS_DIR="$(dirname "$0")/../infra/postgres/seeds"
  echo "Running seeds..."
  for seed in "$SEEDS_DIR"/*.sql; do
    echo "  seed: $(basename "$seed")"
    psql "$DB_URL" -f "$seed"
  done
  echo "Seeds complete."
fi
