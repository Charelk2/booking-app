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
# Run Playwright with NODE_PATH so the config can import the package
NODE_PATH="$(pwd)/frontend/node_modules" \
NEXT_TELEMETRY_DISABLED=1 \
  npx --prefix frontend playwright test --workers=2 -c playwright.config.ts
