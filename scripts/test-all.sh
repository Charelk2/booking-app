#!/bin/bash
set -e
DIR=$(dirname "$0")/..
cd "$DIR"
./setup.sh >/dev/null
pytest -q
cd frontend
# Use node directly so tests run even when node_modules/.bin is missing
node node_modules/jest/bin/jest.js --runInBand --silent
npm run lint >/dev/null
cd ..
# Run Playwright with NODE_PATH so the config can import the package
NODE_PATH="$(pwd)/frontend/node_modules" npx --prefix frontend playwright test -c playwright.config.ts
