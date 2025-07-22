#!/usr/bin/env bash
set -euo pipefail
trap "echo '❌ Test run aborted'; exit 130" INT TERM

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend"
cd "$FRONTEND_DIR"

if [ "${SKIP_FRONTEND:-}" = 1 ]; then
  echo "Skipping frontend tests"
  exit 0
fi

HASH_FILE="node_modules/.pkg_hash"
CURRENT_HASH="$(sha256sum package-lock.json | awk '{print $1}')"
CACHED_HASH=""
if [ -f "$HASH_FILE" ]; then
  CACHED_HASH="$(cat "$HASH_FILE")"
fi

if [ "${FAST:-}" != 1 ]; then
  if [ ! -d node_modules ] || [ "$CURRENT_HASH" != "$CACHED_HASH" ]; then
    echo "Installing frontend dependencies..."
    npm config set install-links true
    if [ "${VERBOSE:-}" = "1" ]; then
      npm ci --prefer-offline --no-audit || FAILED=1
    else
      npm ci --prefer-offline --no-audit --progress=false 2>npm-ci.log || FAILED=1
    fi
    if [ -n "${FAILED:-}" ]; then
      printf '\n❌ npm ci failed.\n' >&2
      NPM_LOG_DIR="$(npm config get cache)/_logs"
      NPM_LOG_FILE="$(find "$NPM_LOG_DIR" -name '*-debug.log' -print0 2>/dev/null | xargs -0 ls -t | head -n 1)"
      if [ -f "$NPM_LOG_FILE" ]; then
        echo "--- npm debug log ($NPM_LOG_FILE) ---" >&2
        cat "$NPM_LOG_FILE" >&2
      fi
      if [ -f npm-ci.log ]; then
        echo "--- npm ci output ---" >&2
        cat npm-ci.log >&2
      fi
      rm -f npm-ci.log
      exit 1
    fi
    rm -f npm-ci.log
    echo "$CURRENT_HASH" > "$HASH_FILE"
    node --version | sed 's/^v//' > node_modules/.meta
  fi
else
  if [ ! -d node_modules ]; then
    echo "❌ FAST=1 but node_modules missing." >&2
    exit 1
  fi
fi

JEST_WORKERS_OPT="${JEST_WORKERS:-50%}"

run_unit=0
run_e2e=0

for arg in "$@"; do
  case "$arg" in
    --unit) run_unit=1 ;;
    --e2e) run_e2e=1 ;;
  esac
done

JEST_EXTRA_ARGS=(--detectOpenHandles --forceExit)

run_jest() {
  timeout 15m "$@" || return $?
}

rerun_in_band() {
  echo "Retrying changed tests in-band..."
  timeout 15m npx jest --onlyChanged --runInBand "${JEST_EXTRA_ARGS[@]}"
}

if [ "$run_unit" = 1 ]; then
  start_unit=$(date +%s)
  if ! run_jest npm run test:unit -- --maxWorkers="$JEST_WORKERS_OPT" "${JEST_EXTRA_ARGS[@]}"; then
    rerun_in_band
  fi
  end_unit=$(date +%s)
  echo "Unit tests completed in $((end_unit - start_unit)) seconds"
else
  start_unit=$(date +%s)
  if ! run_jest npm test -- --maxWorkers="$JEST_WORKERS_OPT" "${JEST_EXTRA_ARGS[@]}"; then
    rerun_in_band
  fi
  end_unit=$(date +%s)
  echo "Frontend tests completed in $((end_unit - start_unit)) seconds"
fi

if [ "$run_e2e" = 1 ]; then
  start_e2e=$(date +%s)
  timeout 15m PWTEST_HEADED=0 HEADLESS=1 npx playwright test --reporter=line
  end_e2e=$(date +%s)
  echo "E2E tests completed in $((end_e2e - start_e2e)) seconds"
fi

if { [ "${LINT:-}" = 1 ] || [ "${CI:-}" = "true" ]; } && [ "${SKIP_LINT:-}" != 1 ]; then
  npm run lint --silent
fi
