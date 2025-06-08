#!/bin/bash
set -euo pipefail

# Determine the repository root so the script works from any directory.
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Installing backend Python dependencies..."
pip install -r "$ROOT_DIR/backend/requirements.txt"
pip install -r "$ROOT_DIR/requirements-dev.txt"

echo "Installing frontend Node dependencies..."
cd "$ROOT_DIR/frontend" && npm install
