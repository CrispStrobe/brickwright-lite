## Arcade info/browser qualification repair — 2026-10-09

Codex owns `lane/arcade-info-browser-qualification-20261009`, stacked on PR761.
Repair hosted typed-state observations and stale life/score representation
assertions against the native info API; preserve original PXT behaviour checks.
Move merge-history identity to narrative docs rather than pin-only receipt
fields. Retain all original hosted failures; full hosted browser checks remain
required. No runtime semantic or corpus classification changes are claimed.
Checkpoint `616937a47`:44 affected truth-value, overlap and real-game tests
pass without skips. Original hosted artifact confirms arraysReady=true, no
block errors and no diagnostics; the old observation coerced it to1. Full pin
scan cannot run in this sparse tree and remains a hosted gate.
