#!/usr/bin/env bash
set -euo pipefail

CONTAINER="${PG_CONTAINER:-docker-postgres-1}"
DB_NAME="${DB_NAME:-ai_sdlc}"
DB_USER="${DB_USER:-dev}"
MIGRATIONS_DIR="$(cd "$(dirname "$0")/../infra/postgres/migrations" && pwd)"
SEEDS_DIR="$(cd "$(dirname "$0")/../infra/postgres/seeds" && pwd)"

run_sql() {
  docker exec -i "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" "$@"
}

run_file() {
  docker exec -i "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" < "$1"
}

echo "Running migrations (container: $CONTAINER, db: $DB_NAME)"

for migration in "$MIGRATIONS_DIR"/*.sql; do
  filename=$(basename "$migration")
  version=$(echo "$filename" | grep -oP '^\d+')

  already_applied=$(run_sql -tAc "SELECT 1 FROM schema_migrations WHERE version = $version" 2>/dev/null || echo "")

  if [ "$already_applied" = "1" ]; then
    echo "  skip: $filename (already applied)"
  else
    echo "  apply: $filename"
    run_file "$migration"
  fi
done

echo "Migrations complete."

if [ "${SEED:-}" = "1" ]; then
  echo "Running seeds..."
  for seed in "$SEEDS_DIR"/*.sql; do
    echo "  seed: $(basename "$seed")"
    run_file "$seed"
  done
  echo "Seeds complete."
fi
