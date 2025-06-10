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
REQ_HASH_FILE="$VENV_DIR/.req_hash"
CURRENT_REQ_HASH=$(sha256sum "$ROOT_DIR/backend/requirements.txt" | awk '{print $1}')
CACHED_REQ_HASH=""
if [ -f "$REQ_HASH_FILE" ]; then
  CACHED_REQ_HASH="$(cat "$REQ_HASH_FILE")"
fi
if [ -f "$INSTALL_MARKER" ]; then
  if [ "$CURRENT_REQ_HASH" = "$CACHED_REQ_HASH" ]; then
    echo "Python dependencies already installed and up to date; skipping pip install."
  else
    echo "Requirements changed; reinstalling Python dependencies…"
    if pip install -r "$ROOT_DIR/backend/requirements.txt" \
        && pip install -r "$ROOT_DIR/requirements-dev.txt"; then
      echo "$CURRENT_REQ_HASH" > "$REQ_HASH_FILE"
    else
      echo "\n❌ pip install failed. Check your internet connection or pre-built cache." >&2
      echo "For offline environments, try running ./scripts/docker-test.sh with network access first." >&2
      exit 1
    fi
  fi
else
  echo "Installing backend Python dependencies…"
  if pip install -r "$ROOT_DIR/backend/requirements.txt" \
       && pip install -r "$ROOT_DIR/requirements-dev.txt"; then
    echo "$CURRENT_REQ_HASH" > "$REQ_HASH_FILE"
    touch "$INSTALL_MARKER"
  else
    echo "\n❌ pip install failed. Check your internet connection or pre-built cache." >&2
    echo "For offline environments, try running ./scripts/docker-test.sh with network access first." >&2
    exit 1
  fi
fi

echo "Installing frontend Node dependencies…"
FRONTEND_DIR="$ROOT_DIR/frontend"
FRONTEND_MARKER="$FRONTEND_DIR/node_modules/.install_complete"
PKG_HASH_FILE="$FRONTEND_DIR/node_modules/.pkg_hash"
CURRENT_PKG_HASH=$(sha256sum "$FRONTEND_DIR/package-lock.json" | awk '{print $1}')
CACHED_PKG_HASH=""
if [ -f "$PKG_HASH_FILE" ]; then
  CACHED_PKG_HASH="$(cat "$PKG_HASH_FILE")"
fi
if [ -f "$FRONTEND_MARKER" ]; then
  if [ "$CURRENT_PKG_HASH" = "$CACHED_PKG_HASH" ]; then
    echo "Node dependencies already installed and up to date; skipping npm ci."
  else
    echo "package-lock.json changed; reinstalling Node dependencies…"
    pushd "$FRONTEND_DIR" > /dev/null
    npm config set install-links true
    if npm ci --no-progress; then
      echo "$CURRENT_PKG_HASH" > "$PKG_HASH_FILE"
      touch "$FRONTEND_MARKER"
    else
      echo "\n❌ npm ci failed. Ensure network access or a pre-built npm cache is available." >&2
      echo "For offline environments, try running ./scripts/docker-test.sh with network access first." >&2
      popd > /dev/null
      exit 1
    fi
    popd > /dev/null
  fi
else
  pushd "$FRONTEND_DIR" > /dev/null
  npm config set install-links true
  if npm ci --no-progress; then
    echo "$CURRENT_PKG_HASH" > "$PKG_HASH_FILE"
    touch "$FRONTEND_MARKER"
  else
    echo "\n❌ npm ci failed. Ensure network access or a pre-built npm cache is available." >&2
    echo "For offline environments, try running ./scripts/docker-test.sh with network access first." >&2
    popd > /dev/null
    exit 1
  fi
  popd > /dev/null
fi

echo "Setup complete."
