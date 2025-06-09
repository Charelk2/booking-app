#!/usr/bin/env bash
set -euxo pipefail
echo "--- STARTING setup.sh ---"

# Determine the repository root so the script works from any directory.
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Installing backend Python dependencies..."
if ! python -c "import fastapi" >/dev/null 2>&1; then
  pip install -r "$ROOT_DIR/backend/requirements.txt"
  pip install -r "$ROOT_DIR/requirements-dev.txt"
fi

echo "Node version: $(node --version), npm version: $(npm --version)"
echo "Installing frontend Node dependencies..."
if [ ! -f "$ROOT_DIR/frontend/node_modules/.install_complete" ]; then
  pushd "$ROOT_DIR/frontend" > /dev/null
  rm -rf node_modules
  npm ci --no-progress
  touch node_modules/.install_complete
  popd > /dev/null
fi



echo "Setup complete."
