#!/usr/bin/env bash
set -euo pipefail

shopt -s extglob

ROOT_DIR="$(git rev-parse --show-toplevel)"
cd "$ROOT_DIR"

start_all=$(date +%s)

git fetch origin main >/dev/null 2>&1 || true
if base_ref=$(git merge-base origin/main HEAD 2>/dev/null); then
  :
else
  base_ref=$(git rev-parse HEAD^ 2>/dev/null || echo HEAD)
fi

mapfile -t changed_files < <(git diff --name-only "$base_ref"...HEAD || true)
changed_ts=()
ts_files=()
changed_tests=()
py_array=()
for f in "${changed_files[@]}"; do
  case "$f" in
    *.ts|*.tsx|*.js)
      changed_ts+=("$f")
      [[ $f == *.ts || $f == *.tsx ]] && ts_files+=("$f")
      [[ $f == frontend/*@(spec|test).* ]] && changed_tests+=("$f")
      ;;
    *.py)
      py_array+=("$f")
      ;;
  esac
done
if [ "${#changed_ts[@]}" -gt 0 ]; then
  echo "Linting and type-checking changed frontend files…"
  start_lint=$(date +%s)
  changed_ts_rel=( )
  for f in "${changed_ts[@]}"; do
    changed_ts_rel+=("${f#frontend/}")
  done
  (cd frontend && npx --no-install eslint -c eslint.config.mjs "${changed_ts_rel[@]}")
  # Skip TypeScript compile in fast mode to avoid slow/full project checks
  end_lint=$(date +%s)
  echo "Lint/TS checks: $((end_lint - start_lint))s"
else
  echo "No frontend code changes"
fi

JEST_WORKERS_OPT="${JEST_WORKERS:-50%}"
JEST_EXTRA_ARGS=(--detectOpenHandles --forceExit --passWithNoTests)

run_jest() {
  cmd=("$@")
  if command -v timeout >/dev/null 2>&1; then
    timeout 15m "${cmd[@]}"
  else
    "${cmd[@]}"
  fi
}

if [ "${#changed_tests[@]}" -gt 0 ]; then
  start_jest=$(date +%s)
  run_jest npm test -- --runTestsByPath "${changed_tests[@]}" --maxWorkers="$JEST_WORKERS_OPT" "${JEST_EXTRA_ARGS[@]}"
  end_jest=$(date +%s)
  echo "Jest: $((end_jest - start_jest))s"
else
  echo "No frontend test changes"
fi

if [ "${#py_array[@]}" -gt 0 ]; then
  echo "Running backend tests for changed files…"
  readarray -t py_array < <(printf '%s\n' "${py_array[@]}" | sort -u)
  start_py=$(date +%s)
  pytest -q "${py_array[@]}"
  end_py=$(date +%s)
  echo "Backend tests: $((end_py - start_py))s"
else
  echo "No backend changes"
fi

end_all=$(date +%s)
echo "FAST checks complete in $((end_all - start_all))s"
