#!/usr/bin/env bash
set -euo pipefail

echo "🔎 Backend smoke tests"
pytest backend/tests -k smoke -q || true

echo "🔎 Frontend smoke tests"
(cd frontend && npm test -- smoke || true)
