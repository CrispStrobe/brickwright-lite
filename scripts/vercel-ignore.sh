#!/usr/bin/env bash
# Vercel "Ignored Build Step": exit 0 SKIPS the build, exit 1 lets it proceed.
# The web app only needs rebuilding when web-affecting files change; commits that
# touch only the native apps (apps/**), CI (.github/**) or docs should not trigger
# a full (and OOM-prone) scratch-gui rebuild.
changed=$(git diff --name-only HEAD^ HEAD 2>/dev/null)

# Can't determine the diff (e.g. shallow clone / first deploy) → build to be safe.
if [ -z "$changed" ]; then
  echo "no diff available → build"
  exit 1
fi

if echo "$changed" | grep -qE '^(overlay/|packages/|scripts/|static/|vercel\.json|package\.json|package-lock\.json)'; then
  echo "web-affecting change → build"
  exit 1
fi

echo "only non-web files changed → skip build"
exit 0
