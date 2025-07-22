#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
VENV_DIR="$ROOT_DIR/backend/venv"
REQ_FILE="$ROOT_DIR/backend/requirements.txt"
DEV_REQ_FILE="$ROOT_DIR/requirements-dev.txt"

# Create virtualenv if missing
if [ ! -d "$VENV_DIR" ]; then
  echo "Creating Python virtual environment..."
  python3 -m venv "$VENV_DIR"
fi
# shellcheck source=/dev/null
source "$VENV_DIR/bin/activate"

# Install dependencies if install marker missing or requirements changed
INSTALL_MARKER="$VENV_DIR/.install_complete"
REQ_HASH_FILE="$VENV_DIR/.req_hash"
CURRENT_HASH="$(sha256sum "$REQ_FILE" "$DEV_REQ_FILE" | sha256sum | awk '{print $1}')"
CACHED_HASH=""
if [ -f "$REQ_HASH_FILE" ]; then
  CACHED_HASH="$(cat "$REQ_HASH_FILE")"
fi

if [ ! -f "$INSTALL_MARKER" ] || [ "$CURRENT_HASH" != "$CACHED_HASH" ]; then
  echo "Installing backend dependencies..."
  pip install -r "$REQ_FILE" -r "$DEV_REQ_FILE"
  echo "$CURRENT_HASH" > "$REQ_HASH_FILE"
  touch "$INSTALL_MARKER"
fi

pytest_args=("-q" "--maxfail=1" "--disable-warnings")
if python -c "import pkgutil, sys; sys.exit(pkgutil.find_loader('xdist') is None)"; then
  pytest_args=("-n" "auto" "${pytest_args[@]}")
fi

cd "$ROOT_DIR"
pytest "${pytest_args[@]}"
