#!/usr/bin/env bash
set -euo pipefail

# Retry docker push / manifest push on transient GHCR errors such as
# toomanyrequests (org-wide 2000 requests/minute).
#
# Usage:
#   docker-push-retry.sh <image> [<image> ...]
#   PUSH_COMMAND="docker manifest push" docker-push-retry.sh <manifest> [...]

max_attempts="${MAX_ATTEMPTS:-6}"
delay="${INITIAL_DELAY_SECONDS:-5}"
read -r -a cmd <<<"${PUSH_COMMAND:-docker push}"

if [[ $# -eq 0 ]]; then
  echo "usage: $0 <image> [<image> ...]" >&2
  exit 1
fi

for target in "$@"; do
  attempt=1
  current_delay="$delay"
  while true; do
    if "${cmd[@]}" "$target"; then
      break
    fi
    if (( attempt >= max_attempts )); then
      echo "error: ${cmd[*]} failed after ${max_attempts} attempts: ${target}" >&2
      exit 1
    fi
    echo "${cmd[*]} failed (attempt ${attempt}/${max_attempts}); retrying in ${current_delay}s: ${target}" >&2
    sleep "$current_delay"
    current_delay=$(( current_delay * 2 ))
    attempt=$(( attempt + 1 ))
  done
done
