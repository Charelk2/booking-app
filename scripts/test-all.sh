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

# Always run both backend and frontend tests
echo "⚙️  Installing dependencies…"
# When running this script inside Docker, use --network bridge or set
# DOCKER_TEST_NETWORK=bridge if npm fails to contact registry.npmjs.org.
./setup.sh

echo "🧪 Running backend tests…"
source backend/venv/bin/activate
pytest -q --maxfail=1 --disable-warnings

echo "🧪 Running frontend tests…"
pushd frontend >/dev/null

# only do npm ci once per container/session
if [ ! -f node_modules/.install_complete ]; then
  npm config set install-links true
  if ! npm ci --prefer-offline --no-audit --progress=false 2>npm-ci.log; then
    echo "\n❌ npm install failed." >&2
    echo "   Verify your proxy settings or run ./scripts/docker-test.sh with DOCKER_TEST_NETWORK=bridge" >&2
    if [ -s npm-ci.log ]; then
      echo "--- npm ci output ---" >&2
      cat npm-ci.log >&2
    fi
    NPM_LOG_DIR="$(npm config get cache)/_logs"
    NPM_LOG_FILE="$(ls -t "$NPM_LOG_DIR"/*-debug.log 2>/dev/null | head -n 1)"
    if [ -f "$NPM_LOG_FILE" ]; then
      echo "--- npm debug log ($NPM_LOG_FILE) ---" >&2
      cat "$NPM_LOG_FILE" >&2
    fi
    rm -f npm-ci.log
    popd >/dev/null
    exit 1
  fi
  rm -f npm-ci.log
  touch node_modules/.install_complete
fi

JEST_BIN="node_modules/.bin/jest"
if [ ! -x "$JEST_BIN" ]; then
  JEST_BIN="$(command -v jest 2>/dev/null || true)"
fi
if [ ! -x "$JEST_BIN" ]; then
  echo "❌ Jest binary not found. Did npm ci finish successfully?" >&2
  exit 1
fi
echo "Jest $($JEST_BIN --version) at $JEST_BIN"

if [ -n "${JEST_WORKERS:-}" ]; then
  echo "▶️  Using JEST_WORKERS=$JEST_WORKERS"
  npm test -- --maxWorkers="$JEST_WORKERS"
else
  npm test
fi
npm run lint --silent
popd >/dev/null

echo "--- ALL TESTS COMPLETE ---"
