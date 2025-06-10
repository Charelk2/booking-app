#!/usr/bin/env bash
set -euo pipefail

echo "--- STARTING test-all.sh ---"

# 1. What changed?
CHANGED_FILES=$(git diff --name-only HEAD)

# 2. Drop docs-only changes
NON_DOC_CHANGES=$(echo "$CHANGED_FILES" | grep -vE '\.(md|rst|txt)$|^docs/' || true)
if [ -z "$NON_DOC_CHANGES" ] && [ "${FORCE_TESTS:-}" != "1" ]; then
  echo "📄 Only docs changed. Skipping setup and tests."
  exit 0
fi

# 2a. Ensure Node and npm are available
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

# 3. Figure out if we need backend/frontend
BACKEND_CHANGES=$(echo "$NON_DOC_CHANGES" | grep -E '^(backend/|requirements)' || true)
FRONTEND_CHANGES=$(echo "$NON_DOC_CHANGES" | grep -E '^(frontend/|package.json|package-lock.json)' || true)

# 4. If helper scripts changed, run everything
if echo "$NON_DOC_CHANGES" | grep -q '^scripts/'; then
  BACKEND_CHANGES=1
  FRONTEND_CHANGES=1
fi

# 5. If nothing to run, exit
if [ -z "$BACKEND_CHANGES" ] && [ -z "$FRONTEND_CHANGES" ]; then
  echo "✨ No backend or frontend code changed. Skipping tests."
  exit 0
fi

# 6. Only now do we set up
echo "⚙️  Installing dependencies…"
./setup.sh

# 7. Run backend tests if needed
if [ -n "$BACKEND_CHANGES" ]; then
  echo "🧪 Running backend tests…"
  source backend/venv/bin/activate
  pytest -q --maxfail=1 --disable-warnings
else
  echo "✅ Skipping backend tests."
fi

# 8. Run frontend tests if needed
if [ -n "$FRONTEND_CHANGES" ]; then
  echo "🧪 Running frontend tests…"
  pushd frontend >/dev/null

  # only do npm ci once per container/session
  if [ ! -f node_modules/.install_complete ]; then
    npm config set install-links true
    npm ci --prefer-offline --no-audit --progress=false
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

  npm test
  npm run lint --silent
  popd >/dev/null
else
  echo "✅ Skipping frontend tests."
fi

echo "--- ALL TESTS COMPLETE ---"
