#!/bin/bash

FILE_PATH="docs/openapi/admin/admin-api.yaml"
BASE_BRANCH="main"
MODE="changelog"

if command -v oasdiff &> /dev/null; then
    echo "Using local oasdiff: $(command -v oasdiff)"
    OASDIFF_CMD=(oasdiff)
elif command -v docker &> /dev/null; then
    echo "Local oasdiff not found. Using Docker: tufin/oasdiff"
    OASDIFF_CMD=(
        docker run --rm
        -v "$(pwd):/work"
        -w /work
        tufin/oasdiff
    )
else
    echo "Error: 'oasdiff' is not installed and Docker is not available."
    exit 1
fi

if [ ! -f "$FILE_PATH" ]; then
    echo "Error: Local file '$FILE_PATH' does not exist."
    exit 1
fi

BASE_REF="origin/${BASE_BRANCH}"

# Created inside the repo so it is visible to the Docker fallback's bind mount.
TEMP_BASE="$(mktemp "./.oasdiff-base.XXXXXX")"
trap 'rm -f "$TEMP_BASE"' EXIT

if ! git show "${BASE_REF}:${FILE_PATH}" > "$TEMP_BASE" 2>/dev/null; then
    echo "Error: Could not find '$FILE_PATH' at $BASE_REF."
    echo "Try: git fetch origin $BASE_BRANCH"
    exit 1
fi

echo "Comparing: $FILE_PATH (Current)"
echo "Against:   $BASE_REF"
echo "Mode:      $MODE"
echo "--------------------------------------------------------"

"${OASDIFF_CMD[@]}" "$MODE" "$TEMP_BASE" "$FILE_PATH" --format markdown