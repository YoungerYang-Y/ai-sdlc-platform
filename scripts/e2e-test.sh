#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

# Clean
docker exec -i docker-postgres-1 psql -U dev -d ai_sdlc -c "DELETE FROM worker_attempts; DELETE FROM task_runs; DELETE FROM workflow_runs;" > /dev/null

# Start orchestrator
npx tsx apps/orchestrator/src/main.ts &
ORCH_PID=$!
sleep 3

cleanup() { kill $ORCH_PID 2>/dev/null; wait $ORCH_PID 2>/dev/null; }
trap cleanup EXIT

# Create workflow
WF=$(curl -sf -X POST http://localhost:8000/workflows -H "Content-Type: application/json" -d '{"versionSetId":"00000000-0000-0000-0000-000000000001","triggerType":"manual","input":{"requirement":"e2e test"}}')
WF_ID=$(node -p "JSON.parse(process.argv[1]).id" "$WF")
echo "workflow: $WF_ID"

# Run 3 steps
for i in 1 2 3; do
  C=$(curl -sf -X POST http://localhost:8000/tasks/claim -H "Content-Type: application/json" -d '{"workerId":"w1","supportedTaskTypes":["code","verify","review"],"implementation":"codex","versionSetId":"00000000-0000-0000-0000-000000000001"}')
  TYPE=$(node -p "JSON.parse(process.argv[1]).taskRun.taskType" "$C")
  AID=$(node -p "JSON.parse(process.argv[1]).attempt.id" "$C")
  LT=$(node -p "JSON.parse(process.argv[1]).leaseToken" "$C")
  echo "step $i: $TYPE"
  curl -sf -X POST "http://localhost:8000/attempts/${AID}/complete" -H "Content-Type: application/json" -d "{\"leaseToken\":\"${LT}\",\"artifactRefs\":[]}" > /dev/null
  sleep 1
done

# Check final status
STATUS=$(curl -sf "http://localhost:8000/workflows/${WF_ID}" | node -p "JSON.parse(require('fs').readFileSync(0,'utf8')).status")
echo "final: $STATUS"

if [ "$STATUS" = "completed" ]; then
  echo "✓ E2E PASS: code → verify → review → completed"
  exit 0
else
  echo "✗ E2E FAIL: expected completed, got $STATUS"
  exit 1
fi
