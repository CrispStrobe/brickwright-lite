Linux browser boot timing boundary — **DONE candidate 2026-10-03**, Codex;
isolated `[local path omitted]`, exact base
fb30f839f1498210e71da574f46650be8b57334e. Narrow evidence repair within the
held ADP7118 package lane: scripts/verify-cpm-system.mjs, new pure
scripts/lib/linux-boot-timing.mjs, new test/linux-boot-timing.test.mjs and this
paragraph only. Build37121773566 passed all functional boots and package gates
but compared unequal media transport (snapshot1.3s/cold0.3s) as boot time.
Keep strict half-time threshold and all functional/timeouts; compare elapsed
time after the existing media-ready boundary, retain end-to-end/fetch receipts,
refuse invalid or nonpositive timing. Prove slow snapshot and favorable transport
cannot pass. No runtime, pins, workflow, media, timeout or threshold changes.
Merge canonical claim before implementation; combine with frozen6454a2a56 and
qualify the final head once. No unchanged-red rerun or landing on failed receipt.
Canonical remotely merged claim9e9928cc6 precedes implementation. Focused6/6
green, including three isolated executable mutants (transport as boot, inclusive
half-time, invalid phases); full hosted combined qualification remains required.
