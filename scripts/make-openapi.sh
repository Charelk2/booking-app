#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUTPUT="$ROOT_DIR/docs/openapi.json"

pushd "$ROOT_DIR/backend" >/dev/null
if [ -d "venv" ]; then
  # shellcheck source=/dev/null
  source venv/bin/activate
fi
python - <<'PY' "$OUTPUT"
from pathlib import Path
from main import app
import json, sys
schema = app.openapi()
Path(sys.argv[1]).write_text(json.dumps(schema, indent=2))
print(f"OpenAPI schema written to {sys.argv[1]}")
PY
popd >/dev/null
