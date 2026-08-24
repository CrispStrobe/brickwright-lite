#!/usr/bin/env bash
# Vercel "Ignored Build Step": exit 0 SKIPS the build, exit 1 lets it proceed.
#
# Policy (owner ruling 2026-08-24, after the daily deploy quota was
# exhausted by agent push volume and the site silently served stale
# builds): a push does NOT deploy. Deploys happen only when the head
# commit message carries the [deploy] marker — set explicitly on a
# release-worthy commit, or by the deploy-daily workflow's refresh
# commit (at most one per day, and only when web-affecting files moved
# since the last deploy). CI (build.yml) still runs on every push; only
# the Vercel build is gated.
head_msg=$(git log -1 --format=%B 2>/dev/null)
if ! echo "$head_msg" | grep -q '\[deploy\]'; then
  echo "no [deploy] marker on the head commit → skip (CI still validates every push)"
  exit 0
fi

# Marked commits still skip when nothing web-affecting changed (a
# [deploy] on a docs-only commit would burn quota for an identical site).
changed=$(git diff --name-only HEAD^ HEAD 2>/dev/null)
if [ -n "$changed" ] && ! echo "$changed" | grep -qE '^(overlay/|packages/|scripts/|static/|vercel\.json|package\.json|package-lock\.json)'; then
  # Empty refresh commits have no diff and fall through to build.
  echo "[deploy] marker but only non-web files changed → skip"
  exit 0
fi

echo "[deploy] marker → build"
exit 1
