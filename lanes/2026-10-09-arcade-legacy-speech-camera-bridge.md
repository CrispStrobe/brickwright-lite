## Arcade legacy speech camera bridge — 2026-10-09

Codex owns `lane/arcade-legacy-speech-camera-20261009`, stacked on PR768.
Preserve world coordinates, original camera offsets and RelativeToCamera in
legacy speech. Compare original indexed frames at viewport edges, offscreen
owners and camera flag changes. Keep native bubble identity, callbacks, frame
composition and GUI presentation gaps explicit; no corpus reranking.
Checkpoint `b89ab3279`:41 checks pass without skips, including eight complete
original bubble pixel planes and an executed original export comparison.
Negative kinds are excluded from original kind collections; the contract now
requires that empty result while preserving negative-kind creation callbacks.
Native ownership/callback integration and full GUI qualification remain open.
