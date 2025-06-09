#!/usr/bin/env bash
set -euxo pipefail
echo "--- STARTING test-all.sh ---"
DIR=$(dirname "$0")/..
cd "$DIR"
./setup.sh
pytest -q
cd frontend
# Use node directly so tests run even when node_modules/.bin is missing
node node_modules/jest/bin/jest.js --maxWorkers=50%
npm run lint >/dev/null
cd ..
