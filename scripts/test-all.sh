#!/usr/bin/env bash
set -euo pipefail

echo "--- STARTING test-all.sh ---"

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

run_e2e=0
for arg in "$@"; do
  [ "$arg" = "--e2e" ] && run_e2e=1
done

if [ -z "${SKIP_BACKEND:-}" ]; then
  echo "🧪 Running backend tests…"
  ./scripts/test-backend.sh
fi

if [ -z "${SKIP_FRONTEND:-}" ]; then
  echo "🧪 Running frontend tests…"
  if [ "$run_e2e" = 1 ] || [ "${E2E:-}" = 1 ]; then
    ./scripts/test-frontend.sh --unit --e2e
  else
    ./scripts/test-frontend.sh --unit
  fi
fi

echo "--- ALL TESTS COMPLETE ---"
