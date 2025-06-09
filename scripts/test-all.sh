#!/usr/bin/env bash
set -euxo pipefail
echo "--- STARTING test-all.sh ---"

# Fail early when required tooling is missing
if ! command -v node >/dev/null; then
  echo "Node.js is not installed or not in PATH" >&2
  exit 1
fi
if ! command -v npm >/dev/null; then
  echo "npm is not installed or not in PATH" >&2
  exit 1
fi

echo "Using Node $(node --version) and npm $(npm --version)"
DIR=$(dirname "$0")/..
cd "$DIR"

# Determine which tests need to run based on changed files.
CHANGED_FILES=$(git diff --name-only HEAD)
# Filter out docs and other non-code assets.
NON_DOC_CHANGES=$(echo "$CHANGED_FILES" | grep -vE '\.(md|rst|txt)$|^docs/' || true)
if [ -z "$NON_DOC_CHANGES" ]; then
  echo "Only documentation changes detected. Skipping tests."
  exit 0
fi

NEEDS_BACKEND=$(echo "$NON_DOC_CHANGES" | grep -E '^(backend/|requirements)' || true)
NEEDS_FRONTEND=$(echo "$NON_DOC_CHANGES" | grep -E '^(frontend/|package.json|playwright.config.ts)' || true)

# Changes to helper scripts trigger full test runs
if echo "$NON_DOC_CHANGES" | grep -q '^scripts/'; then
  NEEDS_BACKEND=1
  NEEDS_FRONTEND=1
fi

./setup.sh
[ -z "$NEEDS_BACKEND" ] && [ -z "$NEEDS_FRONTEND" ] && {
  echo "No backend or frontend changes detected. Skipping tests.";
  exit 0;
}
[ -n "$NEEDS_BACKEND" ] && pytest -q
if [ -n "$NEEDS_FRONTEND" ]; then
  pushd frontend >/dev/null
# Use node directly so tests run even when node_modules/.bin is missing
JEST=node_modules/jest/bin/jest.js
if [ ! -f "$JEST" ]; then
  echo "Jest binary not found. Attempting to reinstall dependencies" >&2
  echo "Looking for $JEST in $(pwd)" >&2
  ls -al node_modules | head >&2 || true
  popd >/dev/null
  rm -f frontend/node_modules/.install_complete
  ./setup.sh
  pushd frontend >/dev/null
  if [ ! -f "$JEST" ]; then
    echo "Jest binary still missing after reinstall. Was 'npm ci' interrupted?" >&2
    exit 1
  fi
fi

JEST_PATH=$(realpath "$JEST")
echo "Using Jest at $JEST_PATH"
node "$JEST_PATH" --version
JEST_WORKERS=${JEST_WORKERS:-50%}
echo "Running frontend tests with --maxWorkers=$JEST_WORKERS"
node "$JEST_PATH" --maxWorkers="$JEST_WORKERS"
npm run lint >/dev/null
popd >/dev/null
fi
