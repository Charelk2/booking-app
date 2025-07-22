#!/usr/bin/env bash
set -euo pipefail

use_zstd() {
  command -v zstd >/dev/null 2>&1
}

extract() {
  local archive=$1
  local dest=$2
  if [ -f "$archive" ]; then
    if [[ "$archive" == *.zst ]] && use_zstd; then
      tar -C "$dest" -I zstd -xf "$archive"
    else
      tar -C "$dest" -zxf "$archive"
    fi
  fi
}

compress() {
  local src=$1
  local archive=$2
  if use_zstd; then
    tar -C "$(dirname "$src")" -I 'zstd -T0 -19' -cf "$archive" "$(basename "$src")"
  else
    tar -C "$(dirname "$src")" -czf "$archive" "$(basename "$src")"
  fi
}
