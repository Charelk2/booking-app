#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel)"
cd "$ROOT_DIR"

start_all=$(date +%s)

git fetch origin main >/dev/null 2>&1 || true
base_ref=$(git merge-base origin/main HEAD 2>/dev/null || git rev-parse HEAD^ 2>/dev/null || echo HEAD)

mapfile -t changed_ts < <(git diff --name-only "$base_ref"...HEAD | grep -E '\.(ts|tsx|js)$' || true)
if [ "${#changed_ts[@]}" -gt 0 ]; then
  echo "Linting and type-checking changed frontend files…"
  start_lint=$(date +%s)
  npx eslint "${changed_ts[@]}"
  mapfile -t ts_files < <(printf '%s\n' "${changed_ts[@]}" | grep -E '\.(ts|tsx)$' || true)
  if [ "${#ts_files[@]}" -gt 0 ]; then
    npx tsc --noEmit "${ts_files[@]}"
  fi
  end_lint=$(date +%s)
  echo "Lint/TS checks: $((end_lint - start_lint))s"
else
  echo "No frontend code changes"
fi

mapfile -t changed_tests < <(git diff --name-only "$base_ref"...HEAD | grep -E 'frontend.*(spec|test)\.(ts|tsx|js)$' || true)
if [ "${#changed_tests[@]}" -gt 0 ]; then
  start_jest=$(date +%s)
  JEST_WORKERS_OPT="${JEST_WORKERS:-50%}"
  npm test -- --runTestsByPath "${changed_tests[@]}" --maxWorkers="$JEST_WORKERS_OPT" --detectOpenHandles --forceExit
  end_jest=$(date +%s)
  echo "Jest: $((end_jest - start_jest))s"
else
  echo "No frontend test changes"
fi

py_files=$(python3 scripts/py_changed.py)
if [ -n "$py_files" ]; then
  echo "Running backend tests for changed files…"
  start_py=$(date +%s)
  pytest -q "$py_files"
  end_py=$(date +%s)
  echo "Backend tests: $((end_py - start_py))s"
else
  echo "No backend changes"
fi

end_all=$(date +%s)
echo "FAST checks complete in $((end_all - start_all))s"
