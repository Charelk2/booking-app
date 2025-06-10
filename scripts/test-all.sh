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

  npm test
  npm run lint --silent
  popd >/dev/null
else
  echo "✅ Skipping frontend tests."
fi

echo "--- ALL TESTS COMPLETE ---"
