# Gates that cannot fail

Nine distinct ways an assertion passed while checking nothing, all found on 2026-09-02 by two
sessions working the same repository. Two of the nine were written by people who were at that
moment actively hunting the species — one of them by the author of this document, an hour after
naming it. That is the argument for a mechanical sweep rather than for care.

A gate that cannot fail is worse than no gate: it reads as coverage. This repo's house rule 4
already says so ("a gate that can't fail is not a gate — mutation-prove it"); what was missing
was any way to find the ones already written.

## The nine

| # | Mechanism | How it was found | Mechanical? |
| --- | --- | --- | --- |
| 1 | Source-text match that tracks SPELLING, not behaviour — `assert.match(code, /preserved-not-applied/)` passes whether or not the branch can run | a browser gate exercised the path and disagreed | no — read |
| 2 | A rendered-nowhere path asserted as if wired: `data.message` set, forwarded twice, never displayed | reading the render chain | no — read |
| 3 | Fixed-width search window bleeding into the NEXT declaration, so deleting a guard matches its neighbour's | mutation survived | **yes** |
| 4 | Non-greedy capture truncated by a delimiter introduced LATER — `generate_handler!\(\[([\s\S]*?)\]\)` ended at `#[cfg(desktop)]`'s `]`, and the assertion read an empty string | the assertion could no longer fail | **yes** |
| 5 | Qualified name matched by its final segment, so `native_broker::invoke` passes an allow-list as `invoke` | mutation survived | **yes** |
| 6 | Correct about CONTENT, silent about POSITION. A one-sided `indexOf` ordering check is a direction, not a gate, until it is bounded on the far side too | the dispatch moved into a scope where its variable did not exist | partly |
| 7 | A test double with no producer to fail against — a closed allow-list of command names is a copy of a contract with no link back to it, so it cannot rot loudly | the real surface grew a command and the stub answered nothing | partly |
| 8 | Correct and NARROW, where the narrowness is invisible in the PASS LINE. "LEGO SPIKE browser round trip passed" is a sentence about the round trip that a reader hears as one about the page | a human looked at the screenshot | no — **rename**, not fix |
| 10 | A gate bound to an AMBIENT dependency rather than the one under test — a binary resolved from `PATH`, or a checkout outside the repository | stc-compiler-70 wired a root suite into CI for the first time and it went red immediately: those tests had invoked `sdcc`/`ca65` by bare name, bound to the developer's system toolchain, and had never once exercised the binaries the service ships | **yes** |
| 9 | An assertion about an EVENT silently taken as one about a STATE. `waitFor` is a transition; the defect lived in the steady state after it | a screenshot showed a refusal notice over a project whose surfaces had just been cleared | **yes** |

Species 1, 2, 6, 7 came from bw-ci and this session jointly; 8 and the sharper formulation of 9
are bw-ci's; 10 is stc-compiler-70's. Recorded because the list is more useful than any one fix.

Species 10 deserves its own note, because it is the only one so far that hid a defect in
PRODUCTION rather than in a test. Those suites passed for as long as they existed while never
touching the shipped binaries; the first CI run that denied them a system toolchain found that
`POST /assemble` with `debug:true` had never returned the symbol table its README advertised, on
every target. The gate was not weak — it was pointed at the wrong artefact, and nothing said so.

It runs in both directions. Here, two sb3-creator tests compare a vendored snapshot against a
"live sibling checkout" and fail on this machine while passing in CI. Same root: the verdict is
about ambient state rather than about the code.

## What is mechanised

`scripts/audit-gate-shapes.mjs` detects 3, 4, 5, 9 and 10 across `test/` and `scripts/`. It blanks
comments first (length-preserving, so line numbers stay true) — prose ABOUT these shapes is as
common as instances, and the first run flagged its own documentation.

Its hits are SUSPECTS. Whether a lazy capture truly truncates depends on the file it reads, and
that needs a human. The value is that the reading list is 58 items instead of 151 files.

`test/gate-shapes.test.mjs` ratchets the population: the count may fall, never rise. Baseline
measured 2026-09-02 — AMBIENT-BINDING 11, EVENT-AS-STATE 12, SEGMENT-MATCH 1,
TRUNCATED-CAPTURE 8, WINDOWED-SEARCH 37. Lower it as suspects are triaged; raising it to make a push green is the
thing this file exists to prevent. Unlike its subjects, this gate is mutation-proved: adding a
new suspect turns it red naming the kind.

## What is not, and will not be

Species 1, 2, 6, 7 need reading. Species 8 needs no fix at all — the gate is correct; the
sentence is wrong. The remedy is that **a pass line should say what it CHECKED, not what it
RAN**, which is a naming convention rather than a scan, and belongs in review.

sb3-creator's `scripts/gate-inventory.mjs` is the prior art here and covers a disjoint set —
tautologies, corpus-driven vacuity (a loop over an empty collection emits zero subtests and
reports a clean pass), filesystem-discovery vacuity, early returns, unguarded sibling skips.
Run both; neither subsumes the other.
