#!/usr/bin/env bash
# Enforces NFR-P1: main JS chunk ≤ 100 KB gzipped.
set -euo pipefail

DIST_DIR="apps/web/dist/assets"
LIMIT_KB=100

if [ ! -d "$DIST_DIR" ]; then
  echo "FAIL: $DIST_DIR not found. Run 'bun run build' first."
  exit 1
fi

shopt -s nullglob
JS_FILES=("$DIST_DIR"/*.js)
if [ ${#JS_FILES[@]} -eq 0 ]; then
  echo "FAIL: no JS files found in $DIST_DIR"
  exit 1
fi

# Find the largest JS chunk (the main bundle).
MAIN_FILE=""
MAIN_SIZE=0
for f in "${JS_FILES[@]}"; do
  size=$(gzip -c "$f" | wc -c | tr -d ' ')
  if [ "$size" -gt "$MAIN_SIZE" ]; then
    MAIN_SIZE="$size"
    MAIN_FILE="$f"
  fi
done

MAIN_KB=$(( (MAIN_SIZE + 1023) / 1024 ))
echo "Main chunk: $MAIN_FILE ($MAIN_KB KB gzipped, limit ${LIMIT_KB} KB)"

if [ "$MAIN_KB" -gt "$LIMIT_KB" ]; then
  echo "FAIL: main bundle exceeds ${LIMIT_KB} KB gzipped"
  exit 1
fi

echo "Bundle size check passed."
