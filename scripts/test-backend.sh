#!/usr/bin/env bash
set -euo pipefail
trap "echo '❌ Test run aborted'; exit 130" INT TERM

start_backend=$(date +%s)

if [ "${SKIP_BACKEND:-}" = 1 ]; then
  echo "Skipping backend tests"
  exit 0
fi

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
VENV_DIR="$ROOT_DIR/backend/venv"
REQ_FILE="$ROOT_DIR/backend/requirements.txt"
DEV_REQ_FILE="$ROOT_DIR/requirements-dev.txt"

if [ ! -d "$VENV_DIR" ]; then
  if [ "${FAST:-}" = 1 ]; then
    echo "❌ FAST=1 but $VENV_DIR missing." >&2
    exit 1
  fi
  echo "Creating Python virtual environment..."
  python3 -m venv "$VENV_DIR"
fi
# shellcheck source=/dev/null
source "$VENV_DIR/bin/activate"

INSTALL_MARKER="$VENV_DIR/.install_complete"
REQ_HASH_FILE="$VENV_DIR/.req_hash"
CURRENT_HASH="$(sha256sum "$REQ_FILE" "$DEV_REQ_FILE" | sha256sum | awk '{print $1}')"
CACHED_HASH=""
if [ -f "$REQ_HASH_FILE" ]; then
  CACHED_HASH="$(cat "$REQ_HASH_FILE")"
fi

if [ "${FAST:-}" != 1 ]; then
  if [ ! -f "$INSTALL_MARKER" ] || [ "$CURRENT_HASH" != "$CACHED_HASH" ]; then
    echo "Installing backend dependencies..."
    pip install -r "$REQ_FILE" -r "$DEV_REQ_FILE"
    echo "$CURRENT_HASH" > "$REQ_HASH_FILE"
    touch "$INSTALL_MARKER"
  fi
fi


pytest_args=("-q" "--maxfail=1" "--disable-warnings" "-n" "auto")
if ! python -c "import pkgutil, sys; sys.exit(pkgutil.find_loader('xdist') is None)"; then
  :
else
  if [ "${FAST:-}" = 1 ]; then
    echo "❌ pytest-xdist not installed. Run without FAST=1 once." >&2
    exit 1
  fi
  echo "Installing pytest-xdist..."
  pip install pytest-xdist>=3.6
fi

export PYTHONPATH="$ROOT_DIR/backend${PYTHONPATH:+:$PYTHONPATH}"

if { [ "${LINT:-}" = 1 ] || [ "${CI:-}" = "true" ]; } && [ "${SKIP_LINT:-}" != 1 ]; then
  if command -v flake8 >/dev/null 2>&1; then
    flake8 "$ROOT_DIR/backend/app" || true
  fi
fi

cd "$ROOT_DIR"
pytest "${pytest_args[@]}"
end_backend=$(date +%s)
echo "Backend tests: $((end_backend - start_backend))s"
