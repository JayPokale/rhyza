#!/bin/bash

# Docker image tag prefix
# Example: for "pal-api-service" will produce "rafiki-v2-pal-api-service"
IMAGE_PREFIX="rafiki-v2-"

# Directories matching this pattern will be ignored
# Should not be empty
IGNORE_PATTERN="operator"

# build all service images
find ./packages -maxdepth 2 -name "Dockerfile" | grep -v "$IGNORE_PATTERN" | while read -r dockerfile; do
  dir=$(dirname "$dockerfile")
  image_tag="$IMAGE_PREFIX$(node -e "process.stdout.write(require('$dir/package.json').name)")"
  echo "Building $image_tag from $dir... for imageTag: $image_tag"
  docker build -f "$dockerfile" -t "$image_tag" .
  minikube image load "$image_tag"
done
