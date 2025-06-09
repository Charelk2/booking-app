#!/bin/bash
set -euo pipefail

# Determine the repository root so the script works from any directory.
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Installing backend Python dependencies..."
if ! python -c "import fastapi" >/dev/null 2>&1; then
  pip install -r "$ROOT_DIR/backend/requirements.txt"
  pip install -r "$ROOT_DIR/requirements-dev.txt"
fi

echo "Installing frontend Node dependencies..."
if [ ! -d "$ROOT_DIR/frontend/node_modules/.bin" ]; then
  pushd "$ROOT_DIR/frontend" > /dev/null
  npm ci --silent
  popd > /dev/null
fi

if [ ! -d "$HOME/.cache/ms-playwright" ]; then
  echo "Installing Playwright browsers..."
  npx --prefix "$ROOT_DIR/frontend" playwright install --with-deps >/dev/null
fi

echo "Setup complete."
