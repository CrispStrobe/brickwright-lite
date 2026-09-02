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
| 11 | PAYLOAD-BLIND: the gate would pass unchanged if the thing under test returned nothing | the 8051 stage tests asserted on tokens and the listing, never on symbols, so an always-empty `passes: []` was green everywhere | no — see below |
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

## The second axis: would it fail if the thing returned nothing?

Species 10 has a companion that stc-compiler-70 identified from the inside, and it is the reason
their defect hid for so long. Ambient binding decided WHICH artefact got tested. A separate,
independent gap decided that nobody noticed the artefact was empty: their 8051 stage tests
asserted on tokens and on the listing and never on symbols, so `passes: []` was not a red test
anywhere — it was a green one.

So the sweep has two questions, not one:

1. Does this gate's verdict depend on ambient state rather than on the code? (species 10)
2. **Would this gate still pass if the thing under test returned nothing at all?** (species 11)

The second is worth asking of every assertion set that touches a payload. A gate can be
ambient-bound and never fail in EITHER direction — passing locally, passing in CI, and never
once looking at the field that was empty.

**The sharper statement, from stc-compiler-70 after auditing their own surface by hand: it is
often not that the floor is MISSING, but that the floor and the coverage are in different
places.** Their `test-symtab.py` checks the introspection payloads properly — `len(tasks) == 2`,
yield addresses distinct and validated against the linker's `.map` — but runs only locally.
Their `test-api.py` is 172 checks against the LIVE service and mentions `symbols` zero times and
`debug` never. So the gate with the floor never ran against production, and the gate that ran
against production had no floor. Neither file looks negligent on its own.

Two things that audit cost them, both worth repeating before anyone runs this by hand:

- **A payload audit manufactures its own false positives by guessing the schema.** They nearly
  filed `image: None` for `/translate-project` — the field is `base64`, and they had checked the
  key the README's prose implied rather than the one the endpoint returns. Same failure as this
  file's 112-hit first pass, in a different costume.
- **Emptiness is only a signal against a fixture chosen to make it non-empty.** `variables: 0
  items` read as degenerate until they noticed the probe program declares no variables.

And a negative result, which is the part most likely to be skipped: they audited every
payload-returning endpoint — compile with symbols and disassemble, transpile, translate,
translate-project, disassemble, uf2 — and everything else was genuinely populated. `/assemble`
was an isolated instance, not the tip of a pattern. "We found one, there are probably more" was
the assumption going in, and it was wrong.

Deliberately NOT mechanised here. The obvious detector — an assertion set that never compares a
payload's contents — is exactly the kind of loose scan this document argues against, and the
honest signature is hard: `assert.ok(result)` is fine when the emptiness is checked two lines
later, and damning when it is not. The closest existing instrument is sb3-creator's
`gate-inventory.mjs` FLOORS column, which already records assertions that a count is at least N;
a payload-returning gate with no floor is the shape to read. Shipping a fifth noisy detector to
claim coverage of species 11 would be the disease, not the cure.

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

## The detector was an instance of what it hunts (2026-09-02)

The WINDOWED-SEARCH rule asked: *is there an `assert(` within 200 characters of this
`slice(0, N)`?* That is a fixed window searched for a construct — the exact shape the rule
exists to find, written into the finder. It reported **37 suspects; 34 were never defects.**

The distinction it was missing is not proximity but **dataflow**:

- A window whose result reaches a **predicate** can make a gate lie.
  `assert.match(body.slice(0, 600), /guard/)` passes when the guard is deleted from the
  method under test and a *neighbouring* method happens to have one.
- A window that only shortens a **failure message** is good practice.
  `check(label, labels.length > 1, labels.join(' | ').slice(0, 160))` truncates prose for a
  human; the verdict is the second argument and is untouched.

Two further sound idioms the tightened rule leaves alone, because in each the truncation
provably cannot change a verdict:

- `assert.deepEqual(degraded.slice(0, 10), [], …)` — shortens the DIFF, not the outcome: any
  non-empty prefix still differs from `[]`.
- `[...level.cells.slice(0, 32)].every(…)` — selects a *row* of a tilemap. A domain, not a
  text window.

After conversion and retightening: **37 → 0**, of which 3 were real
(`test/makecode-ui-contract.test.mjs`, now brace-matched via `test/helpers/js-scope.mjs`).

**The real conversions were not false-green today** — `openArtefactFile` measured 1473
characters against a 1500-character window, a 27-character margin, so they were closer to
false-RED. But the false-green is reachable and was demonstrated rather than argued: with the
byte read moved into the next method and removed from the method under test, the window gate
PASSES and the scope gate fails. That mutation is pinned in `test/js-scope.test.mjs`.

### Two rules learned about writing detectors

1. **A rule that fires on nothing is indistinguishable from a rule that is correct.** Going
   37 → 0 is only meaningful because `audit-gate-shapes.mjs --root <dir>` now runs against
   fixtures, and `test/gate-shapes.test.mjs` proves each shape is still caught, each sound
   idiom is still ignored, and that removing an exemption marker brings the finding back.
2. **A detector will flag its own material.** This one has now done it six times — its
   documentation, its own source, and finally its own test fixtures. The fix is a marker it
   must be told about (`gate-shapes-allow`, honoured per line and the line above), never a
   hardcoded list of its own filenames: that is how a detector learns to lie about itself.

## Twelfth species: POSITIONAL SUBJECT (2026-09-02, found in my own harness)

`scripts/verify-native-broker-e2e.mjs` selected the editor webview as `handles[0]`. That was
true for as long as the broker realm failed to load — one realm, index 0, correct by accident.
The moment the realm was fixed and loaded its document, a second handle appeared, the order
was not the assumed one, and the probe ran INSIDE the broker realm. There
`native_broker_audit` is refused **by design**, because it is bound to the main label.

So the harness printed

    FAIL: the editor could not read the broker audit, so `native_broker_ready` never granted
          its runtime capability

on a run where the boundary had worked perfectly and the log two lines below said
`acknowledged; transport capabilities granted`. A correct refusal, read as the defect it exists
to prevent.

**The shape:** a gate that identifies its subject by POSITION asserts about whatever occupies
that index. It does not fail when it loses its subject — it silently changes subject and keeps
reporting with full confidence. This is AMBIENT-BINDING's sibling: there the binding comes from
outside the repository, here from an ordering nobody promised.

**The rule:** identify the subject by identity — a label, a URL, a role — and assert that
exactly one thing matches. `realms.filter(r => !isBroker(r))` with a `length !== 1` check cannot
quietly move to a different webview; `handles[0]` cannot do anything else.

**Also worth its own line:** this gate had been reporting a real defect for seven runs, so its
red was never questioned. A gate that has been correctly red for a long time is exactly where a
second defect hides, because nobody re-reads a failure they have already explained.

