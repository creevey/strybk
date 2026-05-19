#!/bin/sh

set -eu

if [ "${1:-}" = "--preview" ]; then
  preview_mode=true
  generate_mode=false
elif [ "${1:-}" = "--generate" ]; then
  preview_mode=false
  generate_mode=true
else
  preview_mode=false
  generate_mode=false
fi

if [ "$generate_mode" = true ]; then
  CHANGELOG_FILE="${CHANGELOG_FILE:-CHANGELOG.md}"
  bunx --no-install git-cliff -o "$CHANGELOG_FILE"
  exit 0
fi

if [ -n "${VERSION_TAG:-}" ]; then
  resolved_tag="$VERSION_TAG"
elif [ "$preview_mode" = true ]; then
  latest_tag="$(git describe --tags --abbrev=0 2>/dev/null || true)"
  if [ -n "$latest_tag" ]; then
    resolved_tag="$(bunx --no-install git-cliff --bumped-version)"
  else
    resolved_tag="v0.0.1"
  fi
else
  printf '%s\n' 'VERSION_TAG is required for changelog:release' >&2
  exit 1
fi

CHANGELOG_FILE="${CHANGELOG_FILE:-CHANGELOG.md}"

if [ "$preview_mode" = true ]; then
  preview_file="$(mktemp)"
  cp "$CHANGELOG_FILE" "$preview_file"
  CHANGELOG_FILE="$preview_file"
fi

if [ "$preview_mode" = true ] && grep -Fq "## [${resolved_tag#v}]" "$CHANGELOG_FILE"; then
  :
elif [ -f "$CHANGELOG_FILE" ] && grep -q '^## \[' "$CHANGELOG_FILE"; then
  bunx --no-install git-cliff --unreleased --tag "$resolved_tag" --prepend "$CHANGELOG_FILE"
else
  bunx --no-install git-cliff --unreleased --tag "$resolved_tag" -o "$CHANGELOG_FILE"
fi

if [ "$preview_mode" = true ]; then
  cat "$preview_file"
  rm "$preview_file"
fi