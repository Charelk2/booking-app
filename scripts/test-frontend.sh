#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend"
cd "$FRONTEND_DIR"

MARKER="node_modules/.install_complete"
HASH_FILE="node_modules/.pkg_hash"
CURRENT_HASH="$(sha256sum package-lock.json | awk '{print $1}')"
CACHED_HASH=""
if [ -f "$HASH_FILE" ]; then
  CACHED_HASH="$(cat "$HASH_FILE")"
fi

if [ ! -f "$MARKER" ] || [ "$CURRENT_HASH" != "$CACHED_HASH" ]; then
  echo "Installing frontend dependencies..."
  npm config set install-links true
  if [ "${VERBOSE:-}" = "1" ]; then
    npm ci --prefer-offline --no-audit || FAILED=1
  else
    npm ci --prefer-offline --no-audit --progress=false 2>npm-ci.log || FAILED=1
  fi
  if [ -n "${FAILED:-}" ]; then
    echo "\n❌ npm ci failed." >&2
    NPM_LOG_DIR="$(npm config get cache)/_logs"
    NPM_LOG_FILE="$(ls -t "$NPM_LOG_DIR"/*-debug.log 2>/dev/null | head -n 1)"
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
  touch "$MARKER"
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

if [ "$run_unit" = 1 ]; then
  npm run test:unit -- --maxWorkers="$JEST_WORKERS_OPT"
else
  npm test -- --maxWorkers="$JEST_WORKERS_OPT"
fi

if [ "$run_e2e" = 1 ]; then
  npx playwright test
fi

if [ -z "${SKIP_LINT:-}" ]; then
  npm run lint --silent
fi
