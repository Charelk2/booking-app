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
./setup.sh
pytest -q
cd frontend
# Use node directly so tests run even when node_modules/.bin is missing
JEST=node_modules/jest/bin/jest.js
if [ ! -f "$JEST" ]; then
  echo "Jest binary not found. Was 'npm ci' interrupted?" >&2
  echo "Looking for $JEST in $(pwd)" >&2
  ls -al node_modules | head >&2 || true
  exit 1
fi

JEST_PATH=$(realpath "$JEST")
echo "Using Jest at $JEST_PATH"
node "$JEST_PATH" --version
node "$JEST_PATH" --maxWorkers=50%
npm run lint >/dev/null
cd ..
