#!/usr/bin/env bash
set -euo pipefail
trap "echo '❌ Test run aborted'; exit 130" INT TERM

start_all=$(date +%s)
echo "--- STARTING test-all.sh ---"

export PIP_DISABLE_PIP_VERSION_CHECK=1
export PYTHONWARNINGS=ignore::DeprecationWarning
export npm_config_fund=false npm_config_audit=false

if [ "${FAST:-}" = 1 ]; then
  echo "Running fast incremental checks…"
  ./scripts/fast-check.sh
  exit $?
fi

if [ "${SMOKE:-}" = 1 ] && [ -z "${IN_DOCKER:-}" ]; then
  echo "Running smoke tests via Docker…"
  TEST_SCRIPT=./scripts/test-smoke.sh ./scripts/docker-test.sh
  exit $?
fi

if [ "${E2E:-}" = 1 ] && [ -z "${IN_DOCKER:-}" ]; then
  echo "Running end-to-end tests via Docker…"
  TEST_SCRIPT=./scripts/test-e2e.sh ./scripts/docker-test.sh
  exit $?
fi

# Ensure Node and npm are available
if ! command -v node >/dev/null; then
  echo "❌ node not found in PATH" >&2
  exit 1
fi
echo "node $(node --version)"

if ! command -v npm >/dev/null; then
  echo "❌ npm not found in PATH" >&2
  exit 1
fi
echo "npm $(npm --version)"

# Verify and potentially rewrite the Git remote 'origin' before fetching
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
if origin_url=$(git -C "$ROOT_DIR" remote get-url origin 2>/dev/null); then
  if [[ "$origin_url" == git@github.com:* ]]; then
    echo "⚠️ Switching Git remote from SSH to HTTPS due to network restrictions." >&2
    git -C "$ROOT_DIR" remote set-url origin https://github.com/Charelk2/booking-app.git
  fi
else
  echo "❌ Git remote 'origin' not found." >&2
  exit 1
fi

current_branch=$(git rev-parse --abbrev-ref HEAD)
git fetch origin main >/dev/null 2>&1
if base_ref=$(git merge-base origin/main HEAD 2>/dev/null); then
  :
else
  base_ref=$(git rev-parse HEAD^ 2>/dev/null || echo HEAD)
fi
changed_files=$(git diff --name-only "$base_ref"...HEAD)

if ! echo "$changed_files" | grep -q '^backend/'; then
  export SKIP_BACKEND=1
fi

if ! echo "$changed_files" | grep -q '^frontend/'; then
  export SKIP_FRONTEND=1
fi

run_e2e=0
if echo "$changed_files" | grep -q '^frontend/e2e/'; then
  if [ "$current_branch" = "main" ] || [ "${E2E:-}" = 1 ]; then
    run_e2e=1
  fi
fi

if [ -z "${SKIP_BACKEND:-}" ]; then
  echo "🧪 Running backend tests…"
  FAST=${FAST:-} LINT=${LINT:-} ./scripts/test-backend.sh
fi

if [ -z "${SKIP_FRONTEND:-}" ]; then
  echo "🧪 Running frontend tests…"
  (cd frontend && npm test -- --maxWorkers=${JEST_WORKERS:-50%} --passWithNoTests)
  if [ "$run_e2e" = 1 ]; then
    (cd frontend && npx playwright test --reporter=line)
  fi
fi

end_all=$(date +%s)
echo "--- ALL TESTS COMPLETE in $((end_all - start_all))s ---"
