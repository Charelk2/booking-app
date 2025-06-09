#!/bin/bash
set -e
DIR=$(dirname "$0")/..
cd "$DIR"
./setup.sh >/dev/null
pytest -q
cd frontend
npm test
npm run lint >/dev/null
cd ..
npx --prefix frontend playwright test -c playwright.config.ts
