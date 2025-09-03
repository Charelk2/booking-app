#!/usr/bin/env bash
set -euo pipefail

# Detect if zstd is available for compression/decompression
use_zstd() {
  command -v zstd >/dev/null 2>&1
}

archive_ext=$(use_zstd && echo .tar.zst || echo .tar.gz)
export archive_ext

# Compresses SRC directory into ARCHIVE using zstd when available
# Arguments:
#   $1 - source directory path
#   $2 - destination archive path
compress() {
  local src=$1
  local archive=$2
  local parent
  parent="$(dirname "$src")"
  if use_zstd; then
    tar -C "$parent" -I 'zstd -T0 -19' -cf "$archive" "$(basename "$src")"
  else
    tar -C "$parent" -czf "$archive" "$(basename "$src")"
  fi
}

# Extracts ARCHIVE into PARENT_DIR. The archive must contain a single top-level
# directory which will be created under PARENT_DIR.
extract() {
  local archive=$1
  local parent_dir=$2
  if [ ! -f "$archive" ]; then
    return
  fi
  if [[ "$archive" == *.zst ]] && use_zstd; then
    tar -C "$parent_dir" -I zstd -xf "$archive"
  else
    tar -C "$parent_dir" -zxf "$archive"
  fi
}
