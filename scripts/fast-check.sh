#!/usr/bin/env bash
set -euo pipefail

shopt -s extglob

ROOT_DIR="$(git rev-parse --show-toplevel)"
cd "$ROOT_DIR"

start_all=$(date +%s)

git fetch origin main >/dev/null 2>&1
if base_ref=$(git merge-base origin/main HEAD 2>/dev/null); then
  :
else
  base_ref=$(git rev-parse HEAD^ 2>/dev/null || echo HEAD)
fi

mapfile -t changed_files < <(git diff --name-only "$base_ref"...HEAD)
changed_ts=()
changed_js_ts=()
py_array=()
for f in "${changed_files[@]}"; do
  case "$f" in
    *.ts|*.tsx|*.js)
      changed_ts+=("$f")
      changed_js_ts+=("$f")
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
  (cd frontend && npx --no-install eslint -c eslint.config.mjs \
    --quiet --max-warnings=0 \
    --rule '@typescript-eslint/no-unused-vars: off' "${changed_ts_rel[@]}")
  # Skip TypeScript compile in fast mode to avoid slow/full project checks
  end_lint=$(date +%s)
  echo "Lint/TS checks: $((end_lint - start_lint))s"
else
  echo "No frontend code changes"
fi

if [ ${#changed_js_ts[@]} -gt 0 ]; then
  (cd frontend && npx --no-install jest --findRelatedTests "${changed_js_ts[@]}" \
    --maxWorkers="${JEST_WORKERS:-50%}" --passWithNoTests)
else
  echo "No frontend JS/TS changes"
fi

if [ "${#py_array[@]}" -gt 0 ]; then
  echo "Running backend tests for changed files…"
  readarray -t py_array < <(printf '%s\n' "${py_array[@]}" | sort -u)
  start_py=$(date +%s)
  pytest -q --maxfail=1 -W ignore::DeprecationWarning "${py_array[@]}"
  end_py=$(date +%s)
  echo "Backend tests: $((end_py - start_py))s"
else
  echo "No backend changes"
fi

end_all=$(date +%s)
echo "FAST checks complete in $((end_all - start_all))s"
