#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
TMP_DIR="$(mktemp -d)"

echo "Cloning repository to $TMP_DIR"

git clone "$REPO_ROOT" "$TMP_DIR/booking-app" >/dev/null

pushd "$TMP_DIR/booking-app" >/dev/null

# Ensure working tree is clean
output=$(./scripts/test-all.sh 2>&1)

echo "$output"

if ! echo "$output" | grep -q "Running backend tests"; then
  echo "❌ Backend tests did not run" >&2
  exit 1
fi

if ! echo "$output" | grep -q "Running frontend tests"; then
  echo "❌ Frontend tests did not run" >&2
  exit 1
fi

popd >/dev/null
rm -rf "$TMP_DIR"

echo "✅ test-all.sh executed both suites"
