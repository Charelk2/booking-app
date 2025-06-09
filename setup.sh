#!/bin/bash
set -euo pipefail

# Helper to detect outbound network access.
has_network() {
  curl -s --head --connect-timeout 2 https://pypi.org/ >/dev/null 2>&1
}

# Determine the repository root so the script works from any directory.
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Installing backend Python dependencies..."
if ! python -c "import fastapi" >/dev/null 2>&1; then
  if has_network; then
    pip install -r "$ROOT_DIR/backend/requirements.txt"
    pip install -r "$ROOT_DIR/requirements-dev.txt"
  else
    echo "ERROR: Python packages missing and no network connection." >&2
    echo "Build the Docker image with network access before running tests offline." >&2
    exit 1
  fi
fi

echo "Installing frontend Node dependencies..."
if [ ! -d "$ROOT_DIR/frontend/node_modules/.bin" ]; then
  if has_network; then
    pushd "$ROOT_DIR/frontend" > /dev/null
    npm ci --silent
    popd > /dev/null
  else
    echo "ERROR: Node packages missing and no network connection." >&2
    echo "Build the Docker image with network access before running tests offline." >&2
    exit 1
  fi
fi

# Build Next.js once so Playwright can run offline
if [ ! -d "$ROOT_DIR/frontend/.next" ]; then
  echo "Building frontend..."
  pushd "$ROOT_DIR/frontend" > /dev/null
  NEXT_TELEMETRY_DISABLED=1 npm run build --silent
  popd > /dev/null
fi

PLAYWRIGHT_DIR=$(ls -d "$HOME"/.cache/ms-playwright/chromium* 2>/dev/null | head -n 1 || true)
PLAYWRIGHT_SHELL="$PLAYWRIGHT_DIR/chrome-linux/headless_shell"
if [ ! -f "$PLAYWRIGHT_SHELL" ]; then
  echo "Installing Playwright browsers..."
  if has_network; then
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=0 npx --prefix "$ROOT_DIR/frontend" playwright install --with-deps >/dev/null
  else
    echo "ERROR: Playwright browsers missing and no network connection." >&2
    echo "Build the Docker image with network access before running tests offline." >&2
    exit 1
  fi
fi

echo "Setup complete."
