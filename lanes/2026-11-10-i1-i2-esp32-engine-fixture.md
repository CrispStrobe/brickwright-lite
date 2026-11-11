# I1/I2: ESP32-S3 and S040 browser gates name the shipped engine

Status: claim and change in one PR. Owner: Lite browser-gate lane (Claude),
requested by CrispStrobe. Base: main `d318ed6e22fb`. Tasks I1 and I2 of
`docs/OPEN-TASKS-2026-09-29.md`.

Cause: #1695 moved Lite's web engine to the immutable two-build release
`labwired-wasm-fa992f35` (Core `fa992f35`). #1691 then added the S3 and S040
browser gates, which read the engine identity from the pinned bw-board
fixtures. Those fixtures (bw-board `c840653f`) still named `labwired-wasm-9c420649`
(Core `9c420649`, not an ancestor of `fa992f35`). The supplier fixtures were
the stale side.

Fix: bw-board #729 regenerated the catalog with `gen-labwired-catalog.mjs` and
moved both fixture manifests' engine blocks to the `fa992f35` release; its
exact-head public-factory proof runs the real S040 guest on those bytes. This
PR advances the bw-board pin to that merge across the usual pin surfaces and
regenerates the census-derived files. The engine pin, the gates and their
comparisons are unchanged.

Scope: the bw-board SHA swap in the files that name the pin, regenerated
census/matrix/frozen-control hashes, the I1/I2 rows and this file. Not I3–I6.
