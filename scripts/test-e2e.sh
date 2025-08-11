#!/usr/bin/env bash
set -euo pipefail

E2E=1 IN_DOCKER=1 ./scripts/test-all.sh
