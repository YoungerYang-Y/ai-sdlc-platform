#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

echo "=== Cleaning DB ==="
docker exec -i docker-postgres-1 psql -U dev -d ai_sdlc -c "DELETE FROM worker_attempts; DELETE FROM task_runs; DELETE FROM workflow_runs;" > /dev/null

echo "=== Starting Orchestrator ==="
npx tsx apps/orchestrator/src/main.ts &
ORCH_PID=$!
sleep 2

echo "=== Starting Workers (mock mode) ==="
npx tsx workers/code-worker/src/index.ts --mock &
CODE_PID=$!
npx tsx workers/review-worker/src/index.ts --mock &
REVIEW_PID=$!
sleep 1

cleanup() {
  kill $CODE_PID $REVIEW_PID $ORCH_PID 2>/dev/null
  wait $CODE_PID $REVIEW_PID $ORCH_PID 2>/dev/null
}
trap cleanup EXIT

echo "=== Creating Workflow ==="
WF=$(curl -sf -X POST http://localhost:8000/workflows \
  -H "Content-Type: application/json" \
  -d '{"versionSetId":"00000000-0000-0000-0000-000000000001","triggerType":"manual","input":{"requirement":"implement user login"}}')
WF_ID=$(node -p "JSON.parse(process.argv[1]).id" "$WF")
echo "workflow: $WF_ID"

echo "=== Waiting for workflow to complete ==="
for i in $(seq 1 20); do
  sleep 2
  STATUS=$(curl -sf "http://localhost:8000/workflows/${WF_ID}" | node -p "JSON.parse(require('fs').readFileSync(0,'utf8')).status")
  echo "  poll $i: $STATUS"
  if [ "$STATUS" = "completed" ] || [ "$STATUS" = "failed" ]; then
    break
  fi
done

if [ "$STATUS" = "completed" ]; then
  echo "✓ E2E PASS: Workers drove workflow to completion"
  echo "  code → verify → review → completed"
  exit 0
else
  echo "✗ E2E FAIL: expected completed, got $STATUS"
  exit 1
fi
