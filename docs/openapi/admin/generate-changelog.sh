#!/bin/bash

FILE_PATH="docs/openapi/admin/admin-api.yaml"
BASE_BRANCH="main"
MODE="changelog"

if ! command -v oasdiff &> /dev/null; then
    echo "Error: 'oasdiff' is not installed or not in your PATH."
    exit 1
fi

if [ ! -f "$FILE_PATH" ]; then
    echo "Error: Local file '$FILE_PATH' does not exist."
    exit 1
fi

BASE_REF="origin/${BASE_BRANCH}"
if ! git rev-parse --verify "$BASE_REF" >/dev/null 2>&1; then
    BASE_REF="$BASE_BRANCH"
fi

TEMP_BASE=$(mktemp)
trap 'rm -f "$TEMP_BASE"' EXIT

if ! git show "${BASE_REF}:${FILE_PATH}" > "$TEMP_BASE" 2>/dev/null; then
    echo "Error: Could not find '$FILE_PATH' at $BASE_REF."
    exit 1
fi

echo "Comparing: $FILE_PATH (Current)"
echo "Against:   $BASE_REF"
echo "Mode:      $MODE"
echo "--------------------------------------------------------"

oasdiff "$MODE" "$TEMP_BASE" "$FILE_PATH" --format markdown