#!/usr/bin/env bash
set -euo pipefail

echo "--- STARTING setup.sh ---"
# Determine repo root
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Setting up Python virtual environment…"
VENV_DIR="$ROOT_DIR/backend/venv"
if [ ! -d "$VENV_DIR" ]; then
  python3 -m venv "$VENV_DIR"
fi
# Activate venv
# shellcheck source=/dev/null
source "$VENV_DIR/bin/activate"

INSTALL_MARKER="$VENV_DIR/.install_complete"
if [ -f "$INSTALL_MARKER" ]; then
  echo "Python dependencies already installed; skipping pip install."
else
  echo "Installing backend Python dependencies…"
  pip install -r "$ROOT_DIR/backend/requirements.txt"
  pip install -r "$ROOT_DIR/requirements-dev.txt"
  touch "$INSTALL_MARKER"
fi

echo "Installing frontend Node dependencies…"
FRONTEND_DIR="$ROOT_DIR/frontend"
FRONTEND_MARKER="$FRONTEND_DIR/node_modules/.install_complete"
if [ -f "$FRONTEND_MARKER" ]; then
  echo "Node dependencies already installed; skipping npm ci."
else
  pushd "$FRONTEND_DIR" > /dev/null
  npm config set install-links true
  if npm ci --no-progress; then
    touch "$FRONTEND_MARKER"
  else
    echo "\n❌ npm ci failed. Ensure network access or a pre-built npm cache is available." >&2
    echo "For offline environments, consider running ./scripts/docker-test.sh." >&2
    popd > /dev/null
    exit 1
  fi
  popd > /dev/null
fi

echo "Setup complete."
