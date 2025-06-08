#!/bin/bash
set -euo pipefail

# Determine the repository root so the script works from any directory.
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Installing backend Python dependencies..."
pip install -r "$ROOT_DIR/backend/requirements.txt"
pip install -r "$ROOT_DIR/requirements-dev.txt"

echo "Installing frontend Node dependencies..."
# Temporarily change to the frontend directory so npm can install packages.
# pushd/popd ensure we return to the original working directory.
pushd "$ROOT_DIR/frontend" >/dev/null
npm ci
popd >/dev/null

echo "Setup complete."
