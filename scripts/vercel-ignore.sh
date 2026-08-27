#!/usr/bin/env bash
# Vercel "Ignored Build Step": exit 0 SKIPS the build, exit 1 lets it proceed.
#
# Policy (owner ruling 2026-08-27, tightening the 2026-08-24 one): the live
# site tracks CHECKPOINTS, not the tip of main. A push does not deploy. What
# deploys is a release — a version tag, or the release commit that carries it —
# plus an explicit [deploy] marker for a deliberate one-off.
#
# Why it keeps tightening: the Vercel account has a daily deploy cap, and six
# lanes pushing to one repo exhausted it twice (2026-08-23, and again
# 2026-08-27, when every push for hours came back "Deployment rate limited —
# retry in 24 hours" and the site silently served a stale build). Gating on
# pushes was not enough, because a daily auto-refresh commit still deployed
# whatever happened to be on main that morning — which is not a checkpoint
# anyone chose.
#
# CI (build.yml) still runs on EVERY push. Only the Vercel build is gated, so
# nothing here weakens verification; it only decides what the public URL shows.
msg=$(git log -1 --format=%B 2>/dev/null)

# A version tag pointing at this commit is the clearest possible checkpoint.
# Vercel's clone does not always carry tags, so this is a bonus signal rather
# than the one it relies on — the release COMMIT below is the dependable path.
tags=$(git tag --points-at HEAD 2>/dev/null | grep -E '^v[0-9]' | head -1)
if [ -n "$tags" ]; then
  echo "release tag $tags points at HEAD → build"
  exit 1
fi

# The release commit itself. `release: 0.1.12 — …` is the shape the release
# commits actually use, and unlike a tag it always survives a shallow clone.
# NOT filtered by which files changed: a release bumps tauri.conf.json,
# Cargo.toml and the tester notes, none of which are "web-affecting" by the
# rule below — filtering it would skip the exact deploy that was asked for.
if echo "$msg" | grep -qE '^release: '; then
  echo "release commit → build"
  exit 1
fi

# A deliberate one-off, for publishing something that is not a version bump.
if echo "$msg" | grep -q '\[deploy\]'; then
  changed=$(git diff --name-only HEAD^ HEAD 2>/dev/null)
  if [ -n "$changed" ] && ! echo "$changed" | grep -qE '^(overlay/|packages/|scripts/|static/|vercel\.json|package\.json|package-lock\.json)'; then
    echo "[deploy] marker but only non-web files changed → skip"
    exit 0
  fi
  echo "[deploy] marker → build"
  exit 1
fi

echo "not a release, tag or [deploy] checkpoint → skip (CI still validates every push)"
exit 0
