#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel)"
cd "$ROOT_DIR"

start_all=$(date +%s)

git fetch origin main >/dev/null 2>&1 || true
if base_ref=$(git merge-base origin/main HEAD 2>/dev/null); then
  :
else
  base_ref=$(git rev-parse HEAD^ 2>/dev/null || echo HEAD)
fi
changed_ts=$(git diff --name-only "$base_ref"...HEAD | grep -E '\.(ts|tsx|js)$' || true)

if [ -n "$changed_ts" ]; then
  echo "Linting and type-checking changed frontend files…"
  start_lint=$(date +%s)
  npx eslint "$changed_ts"
  npx tsc --noEmit "$changed_ts"
  end_lint=$(date +%s)
  echo "Lint/TS checks: $((end_lint - start_lint))s"
else
  echo "No frontend code changes"
fi

changed_tests=$(git diff --name-only "$base_ref"...HEAD | grep -E 'frontend.*(spec|test)\.(ts|tsx|js)$' || true)
if [ -n "$changed_tests" ]; then
  start_jest=$(date +%s)
  JEST_WORKERS_OPT="${JEST_WORKERS:-50%}"
  npm test -- --runTestsByPath "$changed_tests" --maxWorkers="$JEST_WORKERS_OPT" --detectOpenHandles --forceExit
  end_jest=$(date +%s)
  echo "Jest: $((end_jest - start_jest))s"
else
  echo "No frontend test changes"
fi

py_expr=$(python3 scripts/py_changed.py || true)
if [ -n "$py_expr" ]; then
  echo "Running backend tests for changed files…"
  start_py=$(date +%s)
  pytest -q -k "$py_expr"
  end_py=$(date +%s)
  echo "Backend tests: $((end_py - start_py))s"
else
  echo "No backend changes"
fi

end_all=$(date +%s)
echo "FAST checks complete in $((end_all - start_all))s"
