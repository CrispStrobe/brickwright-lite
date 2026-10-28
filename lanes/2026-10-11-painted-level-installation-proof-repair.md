### Painted-level installation proof repair — 2026-10-11

DONE candidate — Codex, branch `fix/painter-installation-proof-20261011`.
Build38155522851 and the independent PR797/800 Builds38155089351 and
38157758738 all failed the same saved-level runtime-after-reopen check.
The saved maps compare exactly; the final runtime receipt instead contains
the platformer's original32x8 map, not the new10x8 map. Diagnose competing
startup writes without assuming that any requested map was actually installed.
Observe the real native tilemap primitive after its unchanged execution, retain
immutable receipts, and require an exact saved-map installation with the same
pixel/wall requirements. Do not claim that this map remains the game's final
map when its other scripts replace it. Envelope: this ledger,
scripts/verify-arcade-tilemap-painter.mjs, new
scripts/lib/arcade-tilemap-installations.mjs and
test/arcade-tilemap-installations.test.mjs. Preserve receiver/arguments/return,
exceptions and restoration; prove wrong/missing installed maps are rejected.
No engine, painter UI, project, dependency, workflow, timeout or tolerance edits.
The prior persistence lane is DONE; active identity/legacy/placement lanes
exclude this persistence proof. Hosted browser qualification remains required.
Local candidate records only the saved block's real changed-map installation,
not a previously matching state or another script's write; snapshot arrays are
copied before later replacement/mutation. Six focused tests cover attribution,
immutable snapshots, refusal, original call semantics, browser serialization
and four executable mutants with genuine assertion failures. Runtime/browser
success remains pending; no timeout or exact-map comparison was weakened.
Combined qualification includes the exact published PR797 package descendant
and PR800 Arcade ordering fix, preserving their commits and attribution.
The two reactive proof files are unchanged from Build38155522851, where both
installed-package cases and both circuit browser journeys passed; that overall
run remains rejected because its inherited painter step failed. This candidate
must pass every enabled hosted check before landing. No standalone older Board
pin adoption is permitted and no deployment is claimed.
Build38172209464 qualifies exact4f7b98a3f: all six enabled Build jobs succeed,
including both browser shards, corpus and FPGA; deployment and verify-gui are
conditional skips, not deployment evidence. Fast suite6849/6828/0/21
(tests/pass/fail/skip). Saved-map installation succeeds; envelope5000 and
point5000 captures retain their exact1V values, with31/312 partial receipts and
1.6ms/160us maximum callback spans respectively. Both circuit journeys pass.
Current-main reconciliation also preserves PR805's independent Renode failure
reply fix and later song ledger claims. Its focused suite passes14/14 after
materializing sparse prerequisites; initial missing-file runs are environment
failures, not product qualification. This executable addition requires a fresh
combined hosted receipt; the previous green is not relabelled as this head.
Final qualification is Build38205559775 at ede781d56: all enabled jobs pass,
including both actual installed reactive cases and circuit/painter browser
proofs. Preserve f946dd18's seven-segment failure, repaired by real display
readiness above. Qualified Board pin9c8777d5 includes both original74b live-span
repair and the later reset/history repair; no old pin downgrade. Main landing
and deployment receipts are separate from these branch qualification results.

The vendor of `sb3-creator eac7a1a` made two OPEN DEFECT sentinels fire — the
shift-register bit test and the four faceplates with dead controls. Both are
written to go red the moment their defect is fixed, and both carry instructions
for what to do when that happens. Two of us followed those instructions, at the
same time, without knowing about each other. The work was done twice, reached
`main` twice, and had to be merged against itself.

Nobody ignored a rule; there was no rule. The coordinating session worked from a
worktree created *before* the other landed, and never re-checked. A worktree is a
photograph of `main`, and the longer you hold it the more of a lie it becomes.
