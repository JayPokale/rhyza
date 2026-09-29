#!/usr/bin/env bash
set -euo pipefail

event_name="${EVENT_NAME:?EVENT_NAME required}"
ref_name="${REF_NAME:?REF_NAME required}"

SHOULD_PUSH_TAG=false
PUSH_DOCKER_IMAGE=false
GENERATE_RELEASE=false

sanitize_docker_tag() {
  local tag="$1"
  tag="$(printf '%s' "$tag" | sed 's/[^a-zA-Z0-9_.-]/_/g')"
  if [[ ! "$tag" =~ ^[a-zA-Z0-9] ]]; then
    tag="tag_${tag}"
  fi
  printf '%s' "$tag"
}

escape_regex() {
  printf '%s' "$1" | sed 's/[][()\.^$*+?{}|]/\\&/g'
}

highest_matching_tag() {
  local major="$1" minor="$2" pre="$3"
  local tags pre_re
  tags="$(git tag -l "v${major}.${minor}.*" --sort=-version:refname || true)"
  if [[ -z "$tags" ]]; then
    return 0
  fi
  if [[ -n "$pre" ]]; then
    pre_re="$(escape_regex "$pre")"
    printf '%s\n' "$tags" | grep -E "^v${major}\.${minor}\.[0-9]+-${pre_re}$" | head -n 1 || true
  else
    printf '%s\n' "$tags" | grep -E "^v${major}\.${minor}\.[0-9]+$" | head -n 1 || true
  fi
}

if [[ "$event_name" == "workflow_dispatch" ]]; then
  NEW_VERSION="$(sanitize_docker_tag "$ref_name")"
  if [[ "$ref_name" != "main" ]]; then
    PUSH_DOCKER_IMAGE=true
  fi
elif [[ "$ref_name" == release/v* ]]; then
  PUSH_DOCKER_IMAGE=true
  SHOULD_PUSH_TAG=true
  GENERATE_RELEASE=true
  prefix="${ref_name#release/}"
  if [[ ! "$prefix" =~ ^v([0-9]+)\.([0-9]+)(\.([0-9]+))?(-([A-Za-z0-9][A-Za-z0-9.-]*))?$ ]]; then
    echo "Invalid release branch name: $ref_name" >&2
    exit 1
  fi
  major="${BASH_REMATCH[1]}"
  minor="${BASH_REMATCH[2]}"
  patch="${BASH_REMATCH[4]}"
  pre_release="${BASH_REMATCH[6]}"
  if [[ -z "$patch" ]]; then
    patch=0
  fi
  highest="$(highest_matching_tag "$major" "$minor" "$pre_release")"
  if [[ -n "$highest" ]]; then
    if [[ ! "$highest" =~ ^v[0-9]+\.[0-9]+\.([0-9]+) ]]; then
      echo "Unparseable existing tag: $highest" >&2
      exit 1
    fi
    patch=$((BASH_REMATCH[1] + 1))
  fi
  NEW_VERSION="v${major}.${minor}.${patch}"
  if [[ -n "$pre_release" ]]; then
    NEW_VERSION="${NEW_VERSION}-${pre_release}"
  fi
else
  NEW_VERSION="$(sanitize_docker_tag "$ref_name")"
fi

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  {
    echo "NEW_VERSION=$NEW_VERSION"
    echo "SHOULD_PUSH_TAG=$SHOULD_PUSH_TAG"
    echo "PUSH_DOCKER_IMAGE=$PUSH_DOCKER_IMAGE"
    echo "GENERATE_RELEASE=$GENERATE_RELEASE"
  } >> "$GITHUB_OUTPUT"
fi

echo "NEW_VERSION=$NEW_VERSION"
echo "SHOULD_PUSH_TAG=$SHOULD_PUSH_TAG"
echo "PUSH_DOCKER_IMAGE=$PUSH_DOCKER_IMAGE"
echo "GENERATE_RELEASE=$GENERATE_RELEASE"
