# Admit the fixed Apycula wheel before the Pyodide packer test

IMPLEMENTED — Codex native/circuit/performance repair owner; isolated implementation
worktree `/private/tmp/brickwright-sim-stats-20261022`, base `0e11f66d5`.
PR #1224's actual unit job 120253366877 failed fetching PyPI metadata for
`apycula==0.32` before `gowin_pack` ran. Preserve that original; it does not
establish a native cancellation defect or a wrong bitstream. Do not rerun the
unchanged failed source or waive the packer test.

Own only `scripts/probe-pyodide-packer.mjs`, a narrow wheel-input helper under
`scripts/lib/`, associated focused acquisition/process tests, and this claim.
Replace the probe's floating index lookup for the already fixed Apycula 0.32
with acquisition of its published pure-Python wheel at an explicit immutable
URL, exact byte size and SHA256. Cache only verified bytes in the probe's
existing ignored artifact area; install that wheel from the Pyodide filesystem.
Reject corrupted, oversized, missing or incomplete input visibly. Bound any
download and preserve failures rather than silently returning to index lookup.
No tool payload is committed or bundled into the app.

Keep package version, actual packing code, `deps=False`, both native bitstream
hashes, design-difference control and existing WasmGC absence precondition.
Preserve the install-only CLI contract, setup deadlines, named-absence behavior,
workflow limits and assertions. No native runtime, supplier pin, firmware, FPGA
hardware or browser-product change. This repairs the probe/test input path.

Require acquisition positive/corruption/refusal/deadline controls, existing CLI
controls, and the unchanged actual two-design Pyodide/native byte comparisons.
Then normally compose the repair into the held native candidate and update the
qualification producer's reviewed request to its new exact source/run. Preserve
other owners and all original records. Claim must land before implementation.

Implementation uses the exact published 0.32 pure-Python wheel, verified by
3,571,664-byte size and SHA256 before local-wheel installation with `deps=False`.
Download is bounded to 30 seconds; corrupt cached input fails without overwrite
or index fallback. No payload is tracked. The original failed job is preserved.

Local qualification: all 18 acquisition/CLI controls pass, including real HTTP
body timeout, cache corruption, truncation, oversize and concurrent publication.
The unchanged actual Pyodide test passes both native bitstream hashes and its
fixture controls (3 passed). Its existing WasmGC-absence control skips because
this Node runtime has WasmGC; no new skip or assertion change was introduced.
Full exact-head hosted qualification is still required before landing. Native
candidate composition and installed-app acceptance remain separate, pending work.
