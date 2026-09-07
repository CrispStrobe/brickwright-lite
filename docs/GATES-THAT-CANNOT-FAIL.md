# Gates that cannot fail

Nine distinct ways an assertion passed while checking nothing, all found on 2026-09-02 by two
sessions working the same repository. Two of the nine were written by people who were at that
moment actively hunting the species — one of them by the author of this document, an hour after
naming it. That is the argument for a mechanical sweep rather than for care.

A gate that cannot fail is worse than no gate: it reads as coverage. This repo's house rule 4
already says so ("a gate that can't fail is not a gate — mutation-prove it"); what was missing
was any way to find the ones already written.

> **THIS FILE HAS GROWN PAST ITS TITLE. Updated 2026-09-04: TWENTY species, not nine.** The
> opening paragraph is kept as written because it dates the original wave, but do not read "nine"
> as the count. The table below already carries eleven rows; species 12–20 are sections further
> down, and three of them (18, 19, 20) were named on 2026-09-04. Species 13 was originally titled
> only "the sixth shape" and had no number, which is why the sequence appeared to skip it — it is
> numbered now.
>
> | # | Name | Where |
> | --- | --- | --- |
> | 1–11 | the original wave, plus PAYLOAD-BLIND and AMBIENT-BINDING | the table below |
> | 12 | POSITIONAL SUBJECT | found in the detector's own harness |
> | 13 | SWALLOWED-PRECONDITION | came out of the 69→0 triage |
> | 14 | TIMEOUT-AS-VALUE | a timeout read as a measurement |
> | 15 | SHADOWED-BY-PRECONDITION | + its cousin, a condition that can never be true |
> | 16 | THE FIX WHOSE ONLY GATE IS SKIPPED | 2026-09-03 |
> | 17 | THE PREREQUISITE THAT WAS NEVER REAL | 2026-09-03 |
> | 18 | ABSENCE CANNOT NAME ITS CAUSE | 2026-09-04 |
> | 19 | WHERE CODE LIVES IS NOT WHETHER IT RUNS | 2026-09-04 |
> | 20 | A CHECK REPORTING ON THE ENVIRONMENT IT RAN IN | 2026-09-04 |
>
> Species 16 and 17 are both now CLOSED as instances: `smoke:debugger` runs on every push, and
> `KNOWN_SWALLOWED` in `gate-coverage` is empty. Passages below that describe its sdcc
> prerequisite in the present tense are annotated where they occur.

## READ THE INDEX IN THIS ORDER INSTEAD (2026-09-05)

The index above is sorted by when I found each species, which is close to
useless — it is a diary, not a triage. The kerotakis lane and the 8086
coverage lane arrived at the same reordering independently, and it is sharper
than anything in this file:

> **Sort by whether the check currently PASSES.**
>
> A failing one is already on someone's list. A *passing* check that cannot
> reach what it names is a false statement about coverage that has been
> believed, possibly for months, and it is strictly more dangerous.

The coverage lane's census is the evidence: both soft-skip idioms it found
were in the passing column, *"which is why a census found them and a year of
green runs didn't."*

The corollary is worth stating because it explains why these survive:
**nobody thanks you for fixing a passing one.** The visible state before and
after is identical — green to green. There is no moment where anything looks
better. That is not a reason to skip them; it is the reason they are still
here.

### The two columns

**Column A — found because something went RED.** These announced themselves.
Species 12 (positional subject), 14 (timeout-as-value), 15
(shadowed-by-precondition) and its cousin, 17 (the prerequisite that was
never real). Ordinary debugging found each one; they cost an afternoon.

**Column B — found only by going and looking, while everything was green.**
Species 1 (spelling, not behaviour), 10 (the cached value), 13
(swallowed-precondition), 16 (the fix whose only gate is skipped), 18
(absence cannot name its cause), 19 (where code lives is not whether it
runs), 20 (a check reporting on the environment it ran in), and the whole
absent-hardware family below.

Every one in column B was believed. Species 10 was believed twice — it came
back and reached master.

**I do not know the current pass/fail state of all twenty**, and I am not
going to assert it from memory; today alone I have quoted a stale sha, a dead
address, and a divergence count that had been wrong for a day. What the two
columns above record is how each was *found*, which is verifiable from this
file. Turning that into a live pass/fail column is mechanisable — that is the
next piece of work on this document, not a claim about it.

## THE GENERAL FORM, which arrived on 2026-09-05 and covers most of this file

From the 8086 coverage lane, and it is the sharpest statement of the disease
anyone has produced here:

> **A success message quantifies over some SET. It is trustworthy only when
> that set equals the set the GOAL cares about.**
>
> The cheap check is one question: **does the success predicate iterate over
> the same set as the invariant it implies?** If loop-set ⊊ goal-set, the
> green is a false statement about the goal.

Every find of 2026-09-05 is an instance, and they only look like different
bugs because the sets have different names:

| the green said | it ranged over | the goal ranged over |
| --- | --- | --- |
| `wrote 15 files, exit 0` | files I wrote | files with local-only content |
| a skipped test's `ok` | the file executed | the fixture was present and asserted |
| `6 file(s), all covered` | files the list names | files carrying lite-only work |
| `found N declarations` | lines matching the regex | names actually declared |
| upstream `has not converged` | assertions that did not throw | a corpus that was actually read |

**And the fix is the same move every time**: iterate the set the GOAL defines,
**scanned from the tree**, never a curated list of what you happened to touch.
A curated list can only fail in the direction it enumerates. That is precisely
what "derive the direction from content on every run" buys — it makes
loop-set = affected-set, so there is no gap for anything to hide in.

The corollary the coverage lane drew for their own tool is the one to imitate:
their oracle-census ranges over fixtures someone **listed**, not fixtures that
**exist**, so a new unlisted skip is invisible to it exactly as fifteen files
were invisible to my allow-list. Naming that about your own instrument, before
anyone makes you, is the whole discipline.

## The absent-device rule, in its strongest form

From the 8086 coverage lane, and better than the version I had been using:

> An absent 8255 reads open-bus `FFh`. But **`FFh` is a CONSTANT and the walk
> is a SEQUENCE**, so it diverges at edge 0 — `0x01` expected, `0xFF` seen —
> and never reads as a match.

Mine required knowing what the absent device reads as, and I wrote three
probes that each depended on a specific value: `EOC` low for the ADC, `'WW'`
at PROM offset 28 for the NE2000, the tick advancing for the scheduler. Every
one of those is a guess about the failure mode, and a wrong guess is a probe
that passes.

**Constant-versus-sequence needs no such guess.** `0xFF`, `0x00`, floating
garbage, a device that latches the last value written — none of it matters,
because a single held value cannot be a walk. The probe is not "does it read
what a present device would read", it is "does it read something a *held
line* cannot produce". That is a property of the stimulus, which you control,
rather than of the absent hardware, which you are guessing about.

Design the stimulus so that absence cannot imitate it, and you no longer need
to know what absence looks like.

## The nine (eleven rows — see the index above)

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

## TRUNCATED-CAPTURE cleared: 8 -> 0 (2026-09-02)

Seven were converted to bracket-matched regions (`balancedAfter` / `balancedFrom` in
`test/helpers/js-scope.mjs`); the eighth is this suite's own demonstration of the shape and is
marked at the site.

The three in `simulator-driver-controls-respond.test.mjs` were the ones that mattered, and not
because they were failing. Their captured text is handed to `new Function`, so a capture that
stops early does not report anything — **it compiles a different program**, or throws a syntax
error that reads as a defect in the driver under test. `_bw_arm`'s terminator was the literal
spelling `} };`, which emitted code can easily contain before its real end. Two of the three
were not even flagged by the detector (its rule looks for `[\s\S]*?`, and those used `.*?`),
which is worth remembering: **the detector finds instances of a shape, not all of them.** Read
the neighbours of every hit.

The primitive is the whole fix. A lazy capture terminated by a literal bracket asks "where is
the next `]`"; the answer is right only when nothing nests. `balancedFrom` asks "where does
THIS bracket close", skipping strings, template literals and comments, and is correct whether
or not anything nests. `balancedFrom` exists separately from `balancedAfter` because a caller
with several identical call sites already knows the index it wants — requiring it to name a
unique signature would push it straight back to a lazy capture.

Proven, not argued: `test/js-scope.test.mjs` pins a source where the lazy capture drops every
entry after a nested array and the balanced region does not, and the converted
`makecode-ui-contract` gate was mutation-checked by deleting an argument from the real call
site (red) and restoring it (green).

## AMBIENT-BINDING cleared: 11 -> 0 (2026-09-02), with a stated residue

Three were never in scope. `scripts/gen-*`, `make-*` and `sync-*` are GENERATORS, and one of
them invoking the developer's `cargo` or `python3` is the intended behaviour. The rule now asks
only of files that render a verdict (`test/**.test.mjs`, `scripts/{verify,proof,audit,oracle,
smoke}-*`), because reporting the generators taught the reader to skim past the class that cost
stc-compiler-70 a real defect.

One was a genuine defect, and not the one the detector was describing:
`verify-microbit-debug-toggle.mjs` fell back to `/Users/<name>/code/wt-fable/...` — a hardcoded
absolute path on one particular laptop. On every other machine that turned "playwright is not
installed" into an ENOENT about a stranger's home directory. Removed; the gate now names what
it is missing.

The rest were triaged at their sites, and the justification in each case is the same: **they
fail CLOSED.** `smoke-debugger` checks for a runnable `sdcc` and its stc-compiler checkout and
`exit 2`s with a named message
(**superseded 2026-09-03 — see the seventeenth species: the sdcc half of that check was for a
tool the script does not use, and removing it is what let the gate run in CI at all**); `oracle-simavr` rejects with the tool's own stderr;
`overlay-packages-pairs` asks `git` about THIS repository's own tracked blobs, so a different
git still answers about the same objects. None of them can pass while their tool is absent,
which is what the shape is about.

**What that does not settle, stated because a zero invites the opposite conclusion:** absence is
proven, IDENTITY is not. A different `sdcc`, a different `simavr`, a different playwright is
still a different verdict, and nothing in this repository pins one. Closing that means recording
each tool's version alongside the result it produced, so a changed oracle is visible rather than
inferred. That is real work and it is not done; the marker exempts the shape, not the residue.

## The sweep is triaged: 69 -> 0, and a sixth shape came out of it (2026-09-02)

    WINDOWED-SEARCH        37 -> 0    dataflow rule + 3 real conversions
    EVENT-AS-STATE         12 -> 0    narrowed to standalone appearances; 5 triaged
    AMBIENT-BINDING        11 -> 0    generators out of scope; 1 real defect; rest fail closed
    TRUNCATED-CAPTURE       8 -> 0    7 converted to bracket-matched regions
    SEGMENT-MATCH           1 -> 0    triaged and kept, bounded to one spelling
    SWALLOWED-PRECONDITION  0 -> 0    NEW, found while triaging EVENT-AS-STATE

**Zero is the most dangerous number this file can print**, so it comes with proof rather than
assurance. `test/gate-shapes.test.mjs` now builds one fixture carrying all six shapes and
requires all six kinds to fire; and the ratchet was checked by dropping a genuinely new suspect
of each class into the tree and confirming it goes red, then removing it. Without that, every
baseline reading zero is indistinguishable from a detector that has been quietly switched off.

### Thirteenth species (the sixth MECHANISED shape): SWALLOWED-PRECONDITION

Found by triaging EVENT-AS-STATE, in two files carrying the same copy-pasted comment:

```js
try { await search.waitFor({state: 'visible'}); await search.fill('counter'); }
catch { /* the example list may not be searchable in this build */ }
```

The gate does not fail and does not skip. It **continues**, and every assertion after it runs
against a state that was never established. It is worse than EVENT-AS-STATE, which at least
asserts something; this asserts nothing and says nothing. All four instances turned out to be
bounded by a downstream hard assertion, and each is now marked with the assertion that bounds
it — which is the only thing that makes such a swallow legitimate.

### What triage actually decided, per class

- **EVENT-AS-STATE was mostly noise, and that was the problem.** A `waitFor` followed
  immediately by a click, fill, count or evaluate is SYNCHRONISATION — the correct way to write
  a browser gate — and it fails loudly when the element never arrives. Seven of twelve were
  that. A class that is mostly noise gets skipped, and the real ones survive inside it.
- **AMBIENT-BINDING contained a real defect that the detector described wrongly.** It reported a
  cross-checkout read; what was actually there was a hardcoded absolute path under `/Users` on
  one particular laptop, which on every other machine turned "playwright is not installed" into
  an ENOENT about a stranger's home directory.
- **The residue is named, not hidden.** Every surviving ambient binding fails closed on
  ABSENCE; none pins the tool's IDENTITY. A different `sdcc` or `simavr` is still a different
  verdict. And none of the appearance assertions proves DISAPPEARANCE, which matters wherever a
  contract includes it. Both are open work, written down rather than closed by marker.

### The marker, after ten self-flags

`gate-shapes-allow` is honoured in `note()`, so every rule obeys it — it was first written into
one rule's branch, which meant a carefully justified finding elsewhere stayed reported no matter
what was written beside it. It exempts the line it sits on and the line below, deliberately: a
marker that acts at a distance silences more than its author is looking at. That is why a block
of six fixtures needs six markers, and that is the right trade.

This detector has now flagged its own material ten times — its documentation, its source, its
test fixtures three separate times, and a source gate that matched the very comment explaining
the hazard it was gating. Every one was fixed with a marker it must be told about, never with a
list of its own filenames.

## Fourteenth species: TIMEOUT-AS-VALUE (2026-09-02)

A bounded wait whose expiry is reported by the VALUE assertion downstream of it, so a timing
failure and a semantic failure produce the same message.

`test/pseudocode-game-examples.test.mjs` waits for a game variable to change, then asserts the
change was exactly one unit:

```js
for (let i = 0; i < 20 && Number(value(coil, 'oxygen').value) === beforeOxygen; i++) { ... }
assert.equal(Number(value(coil, 'oxygen').value), beforeOxygen - 1,
    'dash did not spend exactly one oxygen');
```

CI printed `dash did not spend exactly one oxygen — 5 !== 4`, which reads as a game-rule
regression. It was a flake: the same commit reran green and the test passed 3/3 locally. **The
5 was not a wrong amount — it was the unchanged STARTING value.** The wait expired, the dash
never fired, and the only assertion positioned to notice reported the timeout in the vocabulary
of a semantics failure.

**Why it belongs in this catalogue even though the gate did fail.** The gate bit correctly; the
DIAGNOSIS did not. A gate that reports the wrong failure mode costs the same as one that
reports nothing: the reader goes looking for a defect that is not there, and — worse — the next
person to see it may write it off as "that flaky oxygen test" and stop reading, at which point
a real regression in the same assertion is invisible.

**The rule:** if a wait can expire, assert the expiry SEPARATELY and first, and say how long it
actually waited. `assert.notEqual(value, before, 'the dash never fired: … through N steps')`
before `assert.equal(value, before - 1, …)`. The two failures then have two names.

This also decides when raising a bound is legitimate. Raising a PERF ceiling hides a slowdown
and is forbidden here. Raising an event WAIT is fine once expiry has its own named assertion
reporting its duration — because a genuinely slower subject then surfaces as itself instead of
disappearing into a green run.

### Method note

`pkill -f "node --test test/x"` matches its own invoking shell, because the shell's command
line contains the pattern. It killed the block before the backup line ran. Caught only because
the file's state did not match what the command should have done — the same "read the output,
do not trust the step" habit that broke the `.incognito` hunt.

## The number that was the answer, read past twice (2026-09-03)

Not a new species — a repeat of the oldest lesson in this file, worth recording because of how
cheaply it recurred.

Chasing why a diagnostics panel "rendered zeros", I ran two probes. Both printed:

    declared 2   allowed 1   refused 0   revoked 0

I read `declared 2 allowed 1` as "the panel works" and moved on, twice. The answer was `refused
0`: my assertion demanded a refusal that a `page.reload()` had legitimately cleared. Five
theories about the panel's internals — module duplication, stale deploy, paint race, early open,
null sources — all eliminated by measurement, while the disproof sat in the third field of a line
I had already printed.

**The habit that fails here is not "measure instead of guess".** I did measure, twice. It is
reading the measurement for the thing you expect to see rather than the thing that is there.
`htmlLen=61` was the same shape: a true number, read as confirmation of a theory it did not
support.

The practical form: when a probe returns several fields and you conclude from two of them, say
out loud what the others are. If they do not fit the conclusion, the conclusion is wrong.

The repair is also worth keeping, because a corrected assertion ended up STRONGER than the
original intent — asserting the state BEFORE a lifecycle event, that it is CLEARED after, and
that neither view leaks, where the first attempt only asked "are there rows".

### Eleventh self-flag: a source gate matching the comment that explains it

`capability-browser-gate.test.mjs` bans fixed sleeps in the browser proof —
`assert.doesNotMatch(proof, /waitForTimeout|setTimeout/)` — which is a good rule and it caught a
real violation: my first `readDiagnostics` polled with `setTimeout`. Replacing it with
`waitForFunction` fixed the code, and then the assertion failed again, on the COMMENT explaining
why fixed sleeps are banned. The comment contains the words.

Identical to the broker topology gate matching the sentence describing the `.incognito(true)`
hazard it gates, earlier the same day. Both fixed the same way: strip comments before a source
`doesNotMatch`, because **the ban is on code, not prose**.

The general rule, now that it has happened twice in one day: any assertion that reads source text
and forbids a token will eventually match its own documentation, because the clearest way to
explain a forbidden token is to name it. Strip comments in every such gate, and mutation-prove
afterwards that a real occurrence in CODE is still caught — done here: reinserting an actual
`setTimeout` turns it red.

## Fifteenth species: SHADOWED-BY-PRECONDITION (2026-09-03)

A gate whose prerequisite check exits before its assertions, in a step that downgrades that exit
to a warning. The gate then reports "skipped" on every run forever, and nobody re-reads a skip.

Not a gate that cannot fail. **A gate nobody ever let start.**

The instance: `scripts/smoke-debugger.mjs` checks for a runnable sdcc and a stc-compiler
checkout and `exit 2`s by name when either is missing — correct, fail-closed behaviour. The
workflow step swallows exit 2 as a warning — also defensible on its own.

> **BOTH HALVES ARE GONE, 2026-09-03.** The sdcc prerequisite was for a tool the script never
> calls (measured: it exits 0 with sdcc absent from `PATH`), and is now checked at the point of
> use inside the fallback. The workflow no longer swallows exit 2, CI checks out the stc-compiler
> oracle, and the step runs on every push — its log carries `pc 0x180, cause breakpoint` and
> `opcode lengths: 286 instructions from stc_disasm, 0 disagree`. `KNOWN_SWALLOWED` in
> `gate-coverage` is consequently EMPTY. The paragraphs below are kept as the diagnosis that got
> there; the seventeenth species records what the prerequisite turned out to be worth. Together they meant the
assertions had never executed since the script was written, and behind that skip were three
defects, one of them a product bug in the in-browser compiler's error path.

**Why the existing shapes missed it.** WINDOWED-SEARCH and friends read the gate's SOURCE, and
the source was fine. `gate-coverage` asked "does a workflow run this?" and the answer was yes.
Neither asks the question that mattered: *did the assertions execute?* A skip satisfies "it ran".

**Mechanised** in `test/gate-coverage.test.mjs`: any step invoking an inventoried gate that also
swallows a nonzero exit (`|| true`, `|| :`, an `-eq N` re-raise, or `continue-on-error: true` —
bw-ci's addition, and correct: it is the same shape in different syntax)
must appear in `KNOWN_SWALLOWED` with what the swallow costs. Ratcheted in both directions —
a new undocumented swallow fails, and an entry that no longer swallows must be deleted, so the
list cannot outlive the thing it excuses. Both mutation-proved.

The one live entry says the important part out loud: *"while it exits 2 the assertions do not run
at all, so this entry is a promise to come back, not a resolution."* A swallow is sometimes right
— an infra outage should not freeze a deploy — but it has to be ARGUED where the next person
reads it, and the argument has to name what is being given up.

### The general lesson, which is not about workflows

Three questions look alike and are not:

    is this gate wired?        does a workflow invoke it?
    does this gate run?        does it reach its assertions?
    does this gate bite?       would it fail if the property broke?

This repository had mechanised the first and the third. The second was the gap, and a "skipped"
line is exactly what fills it while looking like coverage.

### Species 15's cheaper cousin: a condition that can never be true

Two ways a gate is silently disabled by its `if:` alone, both now pinned in
`test/gate-coverage.test.mjs`:

- **`steps.<id>.outcome` for an id nothing declares.** One character off —
  `steps.serv.outcome` — evaluates to empty, the condition is permanently false, and the step
  never appears. No error, no warning, no skipped line.
- **A forward reference.** A step's `outcome` is empty until it has run, so keying a gate on a
  step declared BELOW it can never be true either.

Every reference in all seven workflows resolves correctly today, which is precisely when to pin
it: the failure is one keystroke away and looks like nothing at all. Mutation-proved both ways —
`build.yml:504 -> steps.serv is never declared`, and
`build.yml:126 -> steps.deployment is declared LATER (line 945)`.

**A note on the mutation, which is the more useful lesson.** The forward-reference mutation first
reported "no failure" — and the mutation had not applied, because of a quoting error in the
script that made it. A mutation that does not apply is indistinguishable from a test that does not
bite. It surfaced only because a `SyntaxWarning` appeared in the output next to the result I
wanted to see. When a mutation reports green, prove the mutation LANDED before concluding
anything about the test: diff the file, or assert the anchor count, which is what
`scripts/mutation-proof.mjs` does and why it treats a stale anchor as a failure rather than a skip.


## Sixteenth species: THE FIX WHOSE ONLY GATE IS SKIPPED (2026-09-03)

The first fifteen species are all about a gate that runs and checks nothing. This one is
about a gate that checks something real and **never runs**, which the repair schedule then
treats as coverage.

`npm run smoke:debugger` is the only thing in this repo that drives the debugger end to end
against a real compile. In CI it exits 2 for want of SDCC, and the step deliberately
downgrades exit 2 to a warning so the build is not held hostage to a tool the runner cannot
provide. That is a defensible decision about the *build*. It becomes a gap the moment
something is FIXED on the strength of that gate: D-EMU-BP2 was caught by it, diagnosed
through it, and confirmed fixed by it — and if the repair had stopped there, the only thing
standing between the defect and its return was a step that has never once executed in CI.

The defect itself illustrates why a live gate was needed. The faulty predicate,
`stillWaiting()`, was private to `createDebugRunner`'s closure and reachable only through a
live session with a compiled program, a symbol table and a running emulator. Nothing cheaper
could ask it a question. So the repair **lifted it out** — `waitStillPending` is now an
exported pure function taking `{why, blockYield, bwMs}` — for no reason other than that a gate
had to be able to exist. `test/debug-runner-wait-skip.test.mjs` runs in the ordinary suite,
on every push, with no toolchain at all.

The rule: **when you fix something, name the gate that now fails if it regresses, and check
that gate actually runs in CI** — not merely that it exists, and not merely that it passed on
your machine. "It is covered by the smoke test" is not coverage when the smoke test is
skipped. If the only witness is an environment CI does not have, the repair is not finished
until some part of it is testable without that environment.

### And mutation-prove each CLAUSE, not the fix

This repair had two independent halves: scope the suppression to the halted block's own
task, and apply it only when that block is itself a `wait`. Mutating the first failed a
test. Mutating the second — deleting the guard entirely — **passed all seven**.

The guard was not redundant. The fixture was wrong: the `repeat` task in the test carried no
deadline at all, so the function returned `false` for the wrong reason and the guard never
had to do any work. The real case, which the generated C actually produces, is a task with a
**stale** `until` left over from a wait it has already left — `positionOf()` reports the
variable whenever it is non-zero, regardless of state. Given that fixture, deleting the guard
fails immediately.

A surviving mutation is a claim about the *test data* at least as often as it is a claim
about the code. One mutation per clause, and when one survives, fix the fixture before
concluding the clause is spare.

## Seventeenth species: THE PREREQUISITE THAT WAS NEVER REAL (2026-09-03)

Species 16 is a gate that checks something real and never runs. This is its cause, and it is
worse than it looks: a gate skipped in CI for a dependency **it does not actually have**.

`scripts/smoke-debugger.mjs` opened with `execFileSync('sdcc', ['--version'])` and exited 2 if
it was absent. CI has no sdcc, the step downgraded exit 2 to a warning, and the file was
green-by-absence for months — with three real defects behind it. The check was reasonable when
written and simply stopped being true: the in-tree WASM toolchain took over every supported
8051 target, and the native fallback the check protects is now unreachable for them.

Nobody noticed, because a startup prerequisite is exactly the thing you stop reading. It sits
above the assertions, it has a plausible name, and its failure mode is a *warning* that says
"skipped, runs locally" — which is reassuring and, in this case, false. The gate was not
blocked on a missing tool. It was blocked on a **claim** about a missing tool that had gone
stale, and the claim was never tested because it was a prerequisite rather than an assertion.

**What settled it, and the move worth copying.** Not reading — instrumenting. A single
`console.log` at the top of the native fallback showed it is not reached once in a full run.
Then the confirming experiment: build a `PATH` containing node, python3 and coreutils but no
sdcc, and run the script. It exits 0. That is the whole diagnosis, and it took two runs.

So: **before accepting "this gate cannot run in CI", instrument the dependency and prove it is
used.** The question is never "is the tool present" — it is "does this code path execute". They
look identical from the top of the file, and only one of them can be measured.

The structural repair is to move the check to the **point of use**. The native fallback now
tests for sdcc inside itself, where a missing compiler is a real answer to a real question,
instead of at startup where it silenced everything downstream. A prerequisite that exits before
the assertions shadows all of them; one for a tool the file does not use shadows them for
nothing at all.

---

# 2026-09-04: species 10 came back, and it reached master

The list above was written on 2026-09-02. Species 10 — *"a gate bound to an AMBIENT dependency
rather than the one under test … a checkout outside the repository"* — was already in it, with
"**yes**" in the Mechanical column, meaning we knew a sweep could find it.

Two days later four sessions shipped a fresh instance of species 10 to `bw-board` master, and
the review that was supposed to catch it **was itself the instance**.

## What happened

`test/reseat-gate.test.mjs` resolved its fixtures from `../../wt/i8086-ui-cui/gallery` — a git
worktree on the development box, on an unmerged branch. The three JSON files it reads were
tracked in no repository. The suite passed on that machine and could never have passed in CI.

I reviewed that tree before it went to master. I ran the suite myself, uncapped, with a real
exit code and no pipe, *specifically* because I did not want to accept someone else's number.
It returned **3773 tests / 3727 pass / 0 fail**. It returned that *here*. The number was
contingent on a path only this box has, and I handed it over as the basis for the push.

**The verification and the defect were the same act.** That is what makes this worth a section
rather than a row.

### The diagnostic, which is cheap and general

The GREEN case and the RED mutation case **failed together**.

A behaviour change moves one of them. A missing fixture moves both. Any gate with a deliberate
red-proof gets this for free, and it distinguishes "the thing under test changed" from "the
thing under test never ran" without any further investigation.

## The sibling species: a check reports on what it FOUND, never on what EXISTS

The nine above are gates that pass while asserting nothing. This is the neighbouring family:
tools that answer truthfully about a *subset* they silently chose, in a sentence the reader
hears as being about the whole.

Eight instances, one day, five sessions, every one found by accident:

| Mechanism | Said | Meant |
| --- | --- | --- |
| `sparse-checkout` omitted a directory | `1..47 / # fail 0` | six tests could not load; a test that cannot load does not fail |
| `\| tail` on a test run | exit 0 | `tail`'s status, not the suite's — a failing suite reported green three times |
| A 26-entry hand-written sync manifest | "vendored engine up to date" | 26 of 120 files compared; the whole 8086 tier outside the list |
| `--filter=blob:none` clone | no `LICENSE` on disk | MIT, one `sparse-checkout set` away — absence in a sparse clone is evidence of nothing |
| `df` read on `/` | "85% full, careful" | the repos are on another volume with 33 GB free |
| `tail` on a self-describing list | two people reported "4" and "5" | the header said 14; each had a different truncated tail, and the *disagreement* was the artifact |
| A fixed destructure list | every test at both ends green | a new field silently dropped through four hops; the ADC and the scheduler's PIC never reached the board |
| A cross-repo fixture path | 3773 / 0 fail | true on one machine on Earth |

The unifying repair is not "trust the check less". It is **make the check say what it looked
at**:

> `26 vendored files up to date -- but only 26 of 120 vendored files are in this manifest;`
> `94 were NOT checked (run with --dir <checkout> to cover every file)`

A skip that cannot be mistaken for a pass is worth more than a pass.

## The meta-instance, which is the reason to be humble about all of this

The fix for species 10 was to be a detector: wrap `fs`, record every path the process resolves,
fail on anything outside the repository root. It was written by someone who had spent the day
hunting checks that cannot fail.

**It reported `0 findings` against the very file it was written to catch.**

`reseat-gate.test.mjs` does `import { statSync } from 'node:fs'`. An ESM named import binds the
function directly, so patching the module object afterwards intercepts nothing. A detector that
could not fail, built while hunting gates that could not fail — and it was caught only because
its author red-proofed it against the known case instead of shipping it green.

### So the answer is REPRODUCE, not DETECT

`scripts/audit-clean-checkout.mjs` (bw-board `380ce99`) does not look for suspicious paths. It
runs `git archive HEAD` into a temporary directory and runs the tests there.

Anything the tracked tree does not contain is simply absent — whether it was reached by a
literal path, a computed one, a symlink, a loop that stats candidates, or a mechanism nobody
has invented yet. A detector needs a list of ways to escape and is only as current as whoever
last edited it. A reproducer needs no list.

**Detectors encode what we thought of. Reproducers encode the question.**

### And no allow-marker

The first design had a declared-exemption marker for tests that genuinely need a corpus beside
the repository. That was wrong, and the reason belongs here: such a test must **skip loudly**,
and a loud skip already passes the reproducer. A marker would let it pass *vacuously* instead —
converting the one honest outcome into the failure mode this whole document is about.

## Applying it to a NEW test, not just an old one

The habit generalises past auditing other people's work. A machine-contract test was added the
same day for a cache-invalidation bug — attach a device *after* the first advance and confirm it
still ticks. It passed on the first run.

A passing test is not a guard. The invalidation line was deleted from all three machines and the
suite re-run: **23 pass / 3 fail**, red in all three, green again on restore. Only then was it
believed.

That is the whole discipline in one paragraph, and it is cheap: **the only checks any of us
caught today were the ones we deliberately tried to break.**
---

## Eighteenth species: ABSENCE CANNOT NAME ITS CAUSE (2026-09-04)

An assertion that a collection is EMPTY cannot distinguish "nothing happened" from "nothing was
watching" — and those are exactly the two states a breaking gate moves between.

Named by bw-ci while auditing `verify-debug-frames-watch.mjs`, whose entire claim is that zero
requests reach the hosted compiler. An interception that never fires produces the same zero as a
correct one. Note the asymmetry that makes this worse than it sounds: a POSITIVE assertion fails
visibly when its plumbing breaks — a 404, a timeout, a thrown error — while an ABSENCE assertion
fails invisibly, as success.

**The fix is a synthetic positive through the same path.** Before believing the empty list, drive
one known-bad request that MUST be caught, assert it was, clear the record, and only then make the
real claim. `.invalid` (RFC 2606) resolves nowhere, so a broken interception leaks no traffic — it
simply fails to see the probe.

The same disease cost this repository two findings the same day, both in lite's corpus
differential. Its recorder built its pin map only from `stc.pins`, so `08-led-chaser-595` — whose
hardware is entirely a `PART` — recorded ZERO events against the referee's 50, and the differential
read that as the emitter emitting nothing. Fixing that surfaced the sharper one: the recorder does
not produce device-model events at all, and `compareTraces` reads `actual.devices ?? []`, so "not
recorded" and "recorded, none occurred" arrive as the same empty array. A dimension nobody measured
was being reported as disagreement.

**Whenever a gate concludes from an empty collection, ask what else produces that empty
collection.**

## Nineteenth species: WHERE CODE LIVES IS NOT WHETHER IT RUNS (2026-09-04)

bw-ci's phrasing, and it is the whole species: *a gate that asserts where code LIVES says nothing
about whether it RUNS or what it FETCHES.*

`verify-labwired-lazy-bundle.mjs` asserts the heavy engine's loader stays out of the entry bundle.
That was true throughout. Meanwhile `isLabwiredAvailable()` was
`(await loadLabwired()) !== null` — downloading and instantiating a 20 MB engine to answer a yes/no
question, at debug-panel mount, on every first load. Its docstring called it a "cheap availability
probe". Measured on the DEPLOYED site: 8.49 MB over 27 requests, first paint 5.5–9.7 s.

No static analysis of loader position could see it. Only a live network measurement could.

The species has a second instance one layer down, recorded as D-FIRSTLOAD1: `extension-manager.js`
registers builtins as `() => require('…')`, which LOOKS like deferral and is not — webpack resolves
`require` at build time, so 26 gallery extension bodies sit in the first-paint chunk regardless.
Same gate shape, same blind spot, same instrument required to see it.

**When a gate pins a location, ask separately what executes and what it pulls.**

## Twentieth species: A CHECK REPORTING ON THE ENVIRONMENT IT RAN IN (2026-09-04)

**Attribution, stated precisely because the pieces came from different people.** The MEASUREMENT
is lego-47's: they ran the suite and got the number below. The species FRAMING — that this is the
sibling-checkout hazard one step further out, "works on the box with both checkouts" having a
worse cousin in "works on the box with both WORKTREES" — is credited to code-28 in the operational
note in `LANES.md`, and a worktree is not even something CI could be pointed at. This paragraph
says so rather than picking one name, because a shared ledger that guesses at provenance is worth
less than one that says which part it is sure of.

lego-47 ran bw-board's full suite before approving a push to master — uncapped, real exit code, no
pipe, deliberately careful because they did not want to accept someone else's number. It returned
3773 tests, 3727 pass, **0 fail**. It returned that *on that box*, because that box happened to
have a git WORKTREE the test resolved a fixture through:

    const galleryDir = join(here, '..', '..', 'wt', 'i8086-ui-cui', 'gallery');

`/mnt/volume1/code/wt/i8086-ui-cui/gallery`, on the unmerged branch `feat/i8086-ui`, with the
fixtures tracked nowhere in bw-board. CI can never have it. master went red and stayed red.

This is not "a sibling worktree instead of a sibling repo". It is **a check reporting on the
environment it ran in rather than the one it will run in**, and its siblings all appeared within
the same fortnight: a sparse checkout hiding tests, a pipe hiding an exit code, a manifest listing
26 of 94 files, node 20 standing in for CI's node 22, an unpinned sibling engine revision producing
bench-vs-catalogue mismatches. Note that `ci.yml` in that repo already argues the general case, for
`emu8051-stc`: it checks the sibling out INSIDE the workspace because "Actions refuses a path
outside the workspace", and records that fifteen cross-repo tests once skipped silently for weeks.
The rule was written; the next test walked around it.

**Running the suite is not verification if the suite can read the box.** Ask what the check touched
outside the repository.

### The diagnostic tell, which generalises

When a GREEN case and its RED mutation case fail **together**, the fixture is missing — a real
regression moves only one of them. That distinguished "the file is not there" from "the behaviour
changed" on bw-board without running anything, and it applies to any gate that pins both a
positive and its mutation.

## The fourth family: a CACHED value, true when read and false when used

The nine species are gates that pass while asserting nothing. The 2026-09-04
section adds checks that report on a subset they silently chose. Later the same
day a third shape appeared, five times in about two hours, and it is the one
none of our tooling touches.

**A value read correctly, cached, and then used after the world moved.**

| What was cached | When it was true | What it cost |
| --- | --- | --- |
| `origin/feat/…` in a shared worktree | at the moment of the `git diff` | a diff reporting **40,584 deletions across 106 files** on a branch that deleted one. Nearly broadcast |
| A peer's identity from `ListAgents` | when the call returned | I told three sessions to address me by a name that had become a *different, dead* session — and they had been reaching me fine until they followed my instruction |
| "Send failed" read as "peer absent" | never — it was always an inference | two lanes coordinated around a peer who was receiving everything |
| A background task's exit code | for the wrapper shell, which did exit 0 | a suite that failed 1 test reported as green |
| A scratchpad path from earlier in the session | before the session directory changed | a two-line file read as "still running, no failures" |

**Four of the five were mine.** The identity one is the worst, because I
published it: `ListAgents` told me my name once, I never re-derived it, and the
disconfirming evidence sat in a command I had already run twice that hour.

### Why the existing tooling does not help

`audit-clean-checkout` catches the filesystem version — a test reaching for
something the tracked tree does not have. It cannot catch any row above,
because **nothing here is missing**. Every value was read correctly. The defect
is entirely in the gap between reading and using, and that gap is invisible
from either end.

The other families leave a trace: a suspiciously round pass count, a green case
and a red case failing together, a `1..47` where 53 were expected. **A stale
cache just answers, promptly and plausibly.** That is what makes it the hardest
of the three.

### The only defence found so far

Re-derive before you *act*, not before you *read* — and above all before you
**broadcast**. The rule that generalises, from lego-a4:

> The observation was true when made and false when used.

And the corollary, which is the operative gap:

> The 40,584 number will make people check a diff. Nothing makes anyone check
> an identity.

### The one that survived scrutiny, and why

Of the five, only the remote-ref diff was caught *before* it did damage — and
by the person about to broadcast it, who ran `merge-base --is-ancestor` on a
number that felt too large. Their account of the near-miss is worth more than
the rule it produced:

> A correction arrives with the authority of a fix and the social weight of
> someone admitting fault, which is exactly why it slides past the scrutiny the
> original got.

They had two independent supports for their original report and abandoned both
on one sentence of mine — a sentence that happened to be wrong. **A correction
that makes your earlier mistake smaller deserves more scrutiny, not less.**

# 2026-09-05: the instrument, four times in one day

Species (20) says a check can report on the environment it ran in. Today the
same shape arrived four times without touching a single gate under test. In
every case the *subject* was fine and the *instrument* was lying, and in three
of the four the lie was in the shape of good news.

## The exit code that disagreed with its own TAP

A full-suite run came back **exit 0** with `# fail 1` and `not ok 1307` in the
output. Node 20.20.2 exits 1 on a genuinely failing suite; it exits 0 when the
same command is piped without `set -o pipefail`, because the status belongs to
the last stage — `tee`. The TAP was honest and the *status* lied.

This is the inverse of the failure already documented at `build.yml:363`. There,
a suite that could not be CONSTRUCTED printed `# fail 0` beside a `not ok` — the
miscount is in the TAP itself. Here the TAP was correct and the exit code was
not. **The remedies are different and neither covers the other**: that one needs
the TAP parsed, this one needs one line of shell. CI has that line and a comment
explaining why. Ad-hoc local runners are where this bites, and a local runner is
exactly what nobody reviews.

If you take one habit from this file, make it: **never read an exit code as a
verdict on a suite that prints TAP.** Read the TAP.

## A worktree with no `node_modules` reports zero tests and zero failures

Running the suite from a fresh `git worktree` turns every acorn-dependent gate
into the construction failure above. `scripts/aggregate-timeouts.mjs` resolves
`acorn` from the repo root or `packages/scratch-gui`; a worktree has neither, so
the `describe` body throws while the suite is being built and the runner prints

    not ok 20 - the wait census: fixed sleeps are counted, and may only shrink
    # tests 0   # pass 0   # fail 0

`# tests 0` alongside a `not ok` is the tell, and it reads as *nothing to see*
rather than *nothing ran*. The same test is 4/4 green in the real checkout.

This is the counterpart to lego-47's master-red: there, a stray sibling worktree
made a fixture path resolve and the suite went GREEN where CI could not. Here the
worktree makes it go red. **A worktree changes what resolves in both directions**,
so a verdict produced in one is a verdict about the worktree until proven
otherwise — which costs one re-run in the real checkout.

**The cheap remedy, measured 2026-09-05.** Symlinking the real checkout's
`node_modules` (and `packages/scratch-gui/node_modules`) into the worktree makes
those gates resolve and run: 31/31 across `wait-census`, `gate-shapes`,
`gate-coverage`, `no-dead-overlay-modules` and `i8086-capability-report` against
an `origin/main` worktree that reported `# tests 0` without it. Remove the links
before `git worktree remove`.

Scoped deliberately: this worked *here*. A symlinked `node_modules` is itself a
known hazard elsewhere — bw-board tracks one, and a fresh worktree of it turns
five sb3-creator gates red for reasons that have nothing to do with the change
under test. So the rule is not "symlink node_modules", it is **a worktree verdict
is about the worktree until you have made its dependency resolution match the
real checkout, and then said which you did**.

## A metric that counted discussion of a rule as compliance with it

Measuring adoption of the `Claude-Session` trailer, the first count said 78
trailered commits across six sessions — evidence the rule had landed, and it was
about to be written down as such. The command was

    git log --since=… --format='%b' | grep -oE 'session_[A-Za-z0-9]+'

which counts the string ANYWHERE in a concatenated body. Every commit that
*quotes* a session id in prose — this file's neighbours, every message about
attribution — counted as an attribution. After a week of writing about
attribution, prose was most of the corpus. Counted one commit at a time against
the trailer line: **2 of the last 25, and both were mine.**

The instrument agreed with what its author wanted to be true, which is the only
reason it was not checked. Species (11), PAYLOAD-BLIND, pointed at a measurement
rather than a gate: would this number look different if the thing it claims to
count were entirely absent?

## A grep that reported the absence of a thing that was there

Checking whether a browser gate reloads the file it saves, `grep -c setInputFiles`
returned **0** on `verify-lego-spike-roundtrip.mjs`, and most of a finding was
written saying the gate saves and inspects but never reopens — a round trip that
is a one-way trip. It uses `chooser.setFiles(fixture)` through the filechooser
event. The gate does load, and it is in fact a mutation-provable gate on exactly
the defect it was being doubted over: its fixture is generated from a
`DEVICE SPIKE` program, so it carries `extensions: ["spikeprime"]` — a lazy
builtin — without anyone having arranged for it to.

**A grep's zero is a statement about a pattern, never about a repository.** The
only cost of checking was opening the one line the count disagreed with.

## What these four have in common

None of them is a gate. They are the tools used to decide whether gates are
telling the truth, and they fail in precisely the way this file exists to
catalogue: they answer a question adjacent to the one asked, in the vocabulary
of the one asked. The catalogue has been pointed at `test/` all week. It applies
to the shell history too, and the shell history is not reviewed by anyone.

## Species 1, running BACKWARDS: the same defect producing a FALSE RED

Species 1 is *a source-text match that tracks SPELLING, not behaviour*, and it
is listed as a gate that **passes** while checking nothing. On 2026-09-04 the
identical defect produced the opposite symptom three times in one afternoon.

| Gate | Required, literally | What actually changed |
| --- | --- | --- |
| `i8086-browser-gate` | `if (window.__bwPendingMedia) this.setState({machineBooted: true})` | a `_markReactUpdate` call was inserted, splitting the one-liner into a block |
| `circuit-camera-performance` | `React.useCallback((arr) => { … }, [])` | became `(arr, reason = 'programmatic')` with `[performanceProbe]` |

Both from one commit — `perf(react): attribute circuit update sources` — and in
**neither case did the behaviour move**. The replay still replays; the batching
contract still batches one React update for zoom and pan. lite's suite went red
for a parameter name and a line break.

**Why this is worse than the documented direction, not milder.** A false green
hides a defect that is already there. A false red *manufactures* a defect,
teaches everyone that this gate cries wolf, and the next real failure in it
gets explained away with the same shrug that was correct twice before. **A red
everyone learns to dismiss is how a real one hides.**

### And the fix is where the danger is

The first repair of the browser gate widened it to "the condition, then the
setState **within 200 characters**". It went green. It also **stayed green
after the line it exists to protect was deleted** — that file has four
`machineBooted: true` sites and several `__bwPendingMedia` ones, so the window
matched a different pair.

For a few minutes a false red had been replaced by a gate that could not fail,
by someone who had spent the day cataloguing gates that cannot fail.

**Going green is not evidence that a widened assertion still asserts
anything.** The only check that separates the two is deleting what the gate
protects and confirming it goes red. Both repairs are red-proved now; the
second was done that way from the start, and the correct shape turned out to be
"same block" — `if (…) {` with no closing brace before the assertion — rather
than any character window.

### Four more of these are already loaded, and they have not fired yet

Assertions that pin a **one-line `if`** in files the same refactor is working
through. All green today, all one inserted line from a false red:

    circuit-rendering-regressions.test.mjs:71   if (debuggerOn || benchOpen) setRightOpen(true)
    circuit-designer-ux-contract.test.mjs:66    if (debuggerOn || benchOpen) setRightOpen(true)
    circuit-designer-ux-contract.test.mjs:127   if (onSimulationStart) onSimulationStart()
    wave-open-defects.test.mjs:114              if (arming) setArmed(

Listed rather than rewritten. They belong to another lane, they are green, and
loosening a passing assertion is the move that produced the vacuous gate above.
Whoever owns them can decide; what they should not have to do is discover the
pattern a third time.

### The rule

**A source-text gate should match the CLAIM, not the layout.** If the claim is
"these two things happen together", require them in the same block. If it is
"this callback batches its updates", match the body and let the signature and
the dependency array be whatever they are. Anything a formatter, a linter, or
an added log line can change is not the thing being asserted.

## A fifth: the build that verified the previous build (2026-09-05, lego-b9's)

Found by lego-b9 and reported against their own work, which is the only reason
it is here rather than in a postmortem three weeks from now.

They had verified a VM change in the browser twice and reported it green. Both
verifications were against a **stale bundle**. The mechanism is specific to this
repo and applies to everyone working in it:

- `scripts/apply-vm-overlay.mjs` writes our patched `virtual-machine.js` and the
  built-in extension registry **into** `packages/scratch-gui/node_modules/scratch-vm`
  (`DEST`, line 16). That is the whole point of the script.
- webpack's persistent filesystem cache treats `node_modules` as immutable, via
  the default `snapshot.managedPaths`. It is a sound default almost everywhere:
  package contents do not change without a lockfile change.
- Here they do. So the cache never invalidated, and a 40-second "rebuild"
  re-shipped the previous `virtual-machine.js`.

The tell was available and cheap: **grep the built bundle for a symbol the new
code introduces.** `_bwDeserializeCleared` appeared 0 times in a bundle built
from a tree that contained it. A build that finishes suspiciously fast after a
source change has not proved it is fast; it has proved it did not read the change.

Two things make this worse than an ordinary stale artifact. The verification
**passed**, so it produced positive evidence for a claim it never tested — the
shape this whole file is about. And it is invisible in CI, because a runner's
`node_modules/.cache` is gone next run, so every CI build is cold and correct.
The failure is local-only, which means it lands on whoever is doing the careful
manual check before a merge, and never on the machine everybody trusts.

Fixed with `snapshot.managedPaths: []` for cached builds. The general rule:
**a build cache is a claim that inputs have not changed, and any tool that
writes into a "managed" path makes that claim false.** If your repo patches
`node_modules` — vendoring, overlays, postinstall rewrites — the cache must be
told, or every local verification after the first is reporting on a bundle
nobody built.

Corollary for reviewers: "I rebuilt and re-ran it" is not evidence unless the
rebuild was cold or the bundle was grepped for the change. Ask which.

## EVENT-AS-STATE has flagged two things today and both were false (2026-09-05)

The rule looks for a visibility/appearance assertion that stands alone — one not
followed within 180 characters by a `click`, `fill`, `count`, `evaluate` and so
on — on the theory that an appearance nobody acts on proves a thing arrived and
never that it left. Both of today's hits were correct code:

- `bench-i8086-browser.mjs:78` — `device.waitFor({state:'visible'})` is genuine
  synchronisation; `device.selectOption('i8086')` uses the same locator three
  lines below. The rule saw a `mark()` timestamp in between. Triaged by its
  author with a marker at the site.
- `verify-debug-run-to-inspection.mjs:84` and `:94` — both are synchronisation
  before a genuine use, and the detector misses each for a DIFFERENT reason.
  Line 84 waits for the debug panel, which is then clicked three times; the
  180-character look-ahead lands in the `waitForFunction` block between them and
  never reaches the click. Line 94 waits for the run-to control and the very next
  line calls `runTo.isDisabled()` — but `isDisabled` is not in the use-verb list
  (`click`, `fill`, `press`, `type`, `check`, `selectOption`, `count`, `evaluate`,
  `textContent`, `innerText`, `screenshot`, `boundingBox`), so **a query that IS a
  use reads as no use at all.**

Two mechanisms, and neither is a tuning question in the usual sense. The
180-character window is a fixed window searched for a construct — the shape this
file catalogues — and widening it is how a detector stops biting, as its author
has said. The use-verb list is an *allowlist of what counts as using a locator*,
and every predicate query absent from it (`isDisabled`, `isChecked`, `isEditable`,
`getAttribute`, `inputValue`) turns a correct gate into a suspect.

**A correction, because I got this wrong first.** I originally recorded the second
case as `waitForFunction` being matched as an appearance query when it is a
predicate. That reading was tidy and false: the flagged construct is
`panel.waitFor({state:'visible'})` at line 84, not the `waitForFunction` at all. I
had read the audit's line number as pointing at the code I had already decided
was interesting. The real mechanisms are duller and more useful than the one I
invented.

**The point is not that the detector is bad.** It found four real shapes this
week. It is that a rule with a 100% false-positive rate on its last two hits
trains its readers to dismiss it, and a detector nobody reads is worse than no
detector, because its silence is mistaken for evidence. The ratchet keeps the
count at zero, so each false positive costs an unrelated lane a red main until
someone marks it — today that was every branch run in the fleet.

Recorded rather than fixed: `audit-gate-shapes.mjs` is not this lane's tool and
its author is unreachable. Whoever owns it should decide between narrowing the
match and accepting that markers are the intended discharge. Both are defensible;
silently widening the window is not.

## Twenty-first species: ONE THING, COUNTED ONCE PER VIEW (2026-09-06, lego-be)

The general form in this file has always pointed one way: a success message
quantifies over some SET, and if loop-set ⊊ goal-set the green is a false
statement about the goal. Everything catalogued so far is that inequality, or
its documented reversal into a false red.

This is the other inequality, and it does not produce a false green at all.

`I8086Machine.chipRefusals()` collects each chip's ledger of things the model
refuses to do. It reaches a ledger two ways: a chip may shape its own
`report()`, and a name-derived scan picks up any field whose name says it
records a refusal. The YM3812 does both — it has a `report()`, and that report
is built from a field called `unsupported`.

So the first smoke of the finished collector printed the YM3812's rhythm-mode
refusal twice, and the uPD765's bad opcode twice.

**Every count on every row was correct.** `count: 1` was true. The feature name
was true. The symptom was true. The address was true. What was doubled was the
number of ROWS — the collector had enumerated *representations of the ledger*
where it meant to enumerate *events in it*.

This is worth its own entry because of how it fails to look wrong:

- A false green is a claim you can check and find untrue. Here every claim
  checks out. There is no line to disagree with.
- The error is only visible in the CARDINALITY of the result, which is exactly
  the thing a reader does not verify — you read the rows, not the row count.
- It gets worse with better instrumentation. Adding a second path to a ledger
  is normally an improvement; here each added path multiplies the world.
- Downstream it is silent. A consumer joining these rows to a port map gets two
  identical hits and renders two identical lines, which reads as "this happened
  twice" — a plausible fact, and false.

**The tell** is the same question as always, asked about the collector rather
than the loop: *what is the set, and is it a set of things or a set of ways of
looking at things?* A collector that reaches one datum by two routes is
enumerating routes.

**The fix that was not the fix.** Deduplicating the output rows by
`(part, feature)` would have made the symptom go away and left the cause: the
collector would still be walking both routes, and the next ledger reachable
three ways would present as `count` inflation rather than duplicate rows. The
actual fix is that the explicit paths now mark the field they consumed, so each
ledger is read once and there is nothing to deduplicate.

**A companion instance from the same day, one level down.** `YM3812.setState`
rebuilds derived operator state by replaying all 256 registers through `_poke`
— and `_poke` also refuses. So a save/restore added a refusal for every
unsupported bit that happened to be set, and `count` said "the program asked N
times" when the program had asked once and been restored N−1 times. Same shape:
the count quantified over *executions of the write path* rather than over
*requests the program made*. Anyone joining to that number would have been
reading restore traffic and calling it demand.

Gated in bw-board `test/chip-refusals.test.mjs` ("one refusal is one row,
however many views of the ledger exist") and mutation-proved: removing the
consumed-field mark turns it red.

## Twenty-second species: A RULE THAT MATCHES ITS OWN OUTPUT (2026-09-06, lego-be)

This file already records a detector that was an instance of what it hunts.
This is its sibling and not the same thing: that detector matched *code like its
own*. This one matched *its own output*.

The same collector finds ledgers by name — any own field whose name says it
records a refusal, `/refus|unsupport|unmodel|warning|invalid/i`. Deriving rather
than enumerating was itself a fix: the first version listed the four field names
it knew, and the reachability gate immediately found two ledgers it did not
reach. Adding those two by name would have fixed the instances and left the
class.

Then the ledgers gained companion fields, so a sentence-shaped warning could
carry a symptom and an address the way a Map-shaped one does: `modeWarning`
beside `modeWarningAt` and `modeWarningSymptom`.

`modeWarningSymptom` contains "warning". `lastRefusalSymptom` contains "refus".

So the scan collected each *explanation it had just emitted* as a new refusal —
producing rows whose `feature` was another row's `symptom`, and whose own
`symptom` was null. The output of the rule became input to the rule.

**Why this is not just "the regex was too loose."** The regex is right. It is
supposed to match anything whose name says "refusal", and `modeWarningSymptom`
IS named for a refusal — it is the refusal's symptom. Tightening the pattern
until it stopped matching would have broken the property that made deriving
worth doing: that a chip inventing a new ledger name is collected the moment it
exists. The rule did not need to be narrower. It needed to be able to tell a
SUBJECT from a COMPANION, which is a distinction about role, not about naming.

**The general shape.** Any rule that both (a) matches on a property of a name,
and (b) produces artefacts that inherit that name, will eventually consume its
own output. It applies well beyond this collector: a linter that writes a
suppression comment matching its own trigger pattern; a migration that renames
files by a rule and then re-scans the directory; a cache keyed by a hash of
something that includes the cache. The loop closes at whatever moment output
first lands where input is read.

**The fix, and the limit kept deliberately.** Fields ending `At`/`Symptom` are
skipped — *but only when the field they belong to actually exists*. A chip whose
ledger is genuinely named `refusalAt` is still collected, because the suffix is
evidence of a companion only when there is something to be a companion to. That
distinction is gated in both directions, so neither half can rot.

The honest limit rides along with it: collection is by name, so a ledger called
`notes` or `caveats` is unreachable and always will be. There is a test
asserting exactly that — the limit is stated where it would otherwise be
discovered.

Gated in bw-board `test/chip-refusals.test.mjs` ("a ledger sibling is not itself
collected as a ledger"), including the counter-case, and mutation-proved.

## Twenty-third species: THE ARTEFACT NO GATE EVER RAN (2026-09-06, brickwright-lite-ea)

`overlay/scratch-gui/static/roms/i8086-bios.bin` is 64K of committed binary. The
8086 fetches its first instruction from inside it. For two days it could not read
a disk at all — every `INT 13h` returned AH=20h, controller failure — and every
gate in this repository was green the entire time.

Not one of them was wrong. That is the species.

**What the gates actually said.** Three files referenced the ROM.
`rom-paths-exist.test.mjs` checked the *string* `static/roms/i8086-bios.bin`
against the filesystem, and the file was there. `i8086-browser-gate.test.mjs`
looked like the end-to-end gate and is a **source-text** gate: it greps
`verify-i8086-browser.mjs` for evidence strings and never starts a browser.
`debug-runner.js` fetches the ROM on the no-media fallback, a path its own
comment calls *"a path only a user takes"*, because the tests build a machine
directly and the Machine Loader always supplies media. Every one of those
assertions was true. None of them executed a single byte of the file.

**How it got stale.** The ROM was built from bw-board `5584c3f`, the first BIOS
commit. `sync-bw-board.mjs` copies `src/`, and the ROM's source is `rom/bios.asm`,
so the sync never touched it and never mentioned it. The pin moved seven
`bios.asm` commits further on — the entire uPD765 floppy stack, all the CGA
graphics modes — and the binary stayed where it was. Nothing was configured
wrongly. **The artefact was simply outside every mechanism**, and being outside
looks exactly like being fine.

**Why review could not see it either.** A 64K binary is not diffable. "It has
always been like that" and "somebody replaced it" render identically in a diff.
For a built artefact, the usual second line of defence is not merely weaker than
for source — it is absent.

**Distinguish this from species 19** (WHERE CODE LIVES IS NOT WHETHER IT RUNS).
That one is about code that is reachable but never reached. This one is about an
artefact that no gate was ever *pointed at* — there was no skipped test, no dead
branch, no unmet precondition to find. The absence had no location. That is what
makes it invisible to every technique that works by examining what the gates do:
you have to notice what they never mention.

**The fix is two gates, and neither is the other.**
`test/i8086-bios-provenance.test.mjs` proves *origin*: the committed bytes hash to
a manifest naming the bw-board sha they were assembled from, by the assembler this
tree vendors, with `pinAtBuild` compared against the live pin so the recorded
ancestry answer expires the moment its question changes.
`test/i8086-bios-boots.test.mjs` proves the bytes *work*: it boots the ROM in
lite's own vendored machine, and asserts the diskette parameter table's EOT byte
tracks the medium — 9 on a 360K disk, 18 on a 1.44M one.

A hash can never say the second thing. Provenance without execution is a chain of
custody for a package nobody opened.

**The generalisation.** Every repository has artefacts that arrive by a different
route than its source: built images, generated binaries, vendored blobs, pinned
lockfiles, trained weights. Ask of each one, separately from asking whether it is
correct: *what would go red if this file were replaced with the version from two
months ago?* If the answer is nothing, the artefact is outside the mechanism, and
its correctness is currently a matter of memory.

**The measurement, because the species is easier to believe with numbers.** Three
ROMs, one gate file, lite's vendored machine:

| `bios.asm` at | `INT 13h` read | EOT 360K | EOT 1.44M |
|---|---|---|---|
| `5584c3f` — what shipped | **fails, AH=20h** | 9 | 9 |
| `88bbdcf78` — the old pin | ok | 9 | **9** |
| `9a770c8` — after the bump | ok | 9 | 18 |

The middle row is the one worth staring at. The driver works and returns CF
clear, AH=00 — and tells a 1.44M disk that its tracks end at sector 9, so the
controller switches heads mid-read and hands back head 1's sector 1 while
reporting success. Correct-looking, wrong data. ELKS loaded with every second
sector wrong and slid into executing zeros.

The mutation proof for this gate is historical rather than synthetic: the two
previous ROMs *are* the mutation, and the old pin's ROM fails on the 1.44M
assertion alone.

## Twenty-fourth species: THE ARTEFACT IS EXECUTED; ITS CORRESPONDENCE TO ITS SOURCE IS NOT (2026-09-06, lego-a4; recorded by lego-ac)

**Shape.** A build artefact is committed, and a test loads and really runs it. The
test's set is {the tracked bytes}. The goal's set is {what the generator produces
today}. Those coincide only while nobody edits the generator, and they coincide by
accident rather than by construction. Edit the generator and the test stays green,
because it never touched the generator: it measured the artefact and reported on the
source.

**Why it is its own species** rather than a mild case of the twenty-third
(nothing executes it). Nothing-executes-it is findable by grep, and a greppable
failure eventually gets grepped. This one presents as a passing test on a real
artefact that genuinely runs. It looks exactly like coverage, it has no surface at
all until a generator changes, and on that day it presents as THE CHANGE NOT
WORKING rather than as the check being wrong — so it sends the reader to the wrong
file. It is the substitution species with a build artefact as the proxy.

**Instance, measured.** bw-board tracks ten demo ROMs (`rom/blink-demo.bin` and
siblings). Their tests do execute them — `test/i8086-blink-demo.test.mjs` reads the
file and boots it — and nothing regenerates and compares. All ten generators re-run
on 2026-09-06 produced bytes identical to the tracked files, so it is LATENT, not
broken. bw-board ROADMAP R2, `f199199`.

**Lite's own instance, latent as of the pin to `9a770c8`.** `static/roms/i8086-bios.bin`
is executed by `test/i8086-bios-boots.test.mjs` and hashed by
`test/i8086-bios-provenance.test.mjs`; correspondence to `rom/bios.asm` is checked
only when `BW_BOARD_DIR` names a checkout, which CI has not. The source is not
vendored, so CI cannot regenerate and compare. The structural cure below applies:
vendor `rom/bios.asm` (text, same licence as the assembler that is already
vendored) and let CI assemble it and compare — then the manifest's source sha is a
claim CI re-derives rather than one it trusts.

**CLOSED for lite, 2026-09-06.** `rom/bios.asm` is now vendored as
`static/roms/i8086-bios.asm` (MIT, `-text` in `.gitattributes` so no runner's
autocrlf moves its digest), synced by `scripts/sync-i8086-bios.mjs --record` at
the pin and recorded in the manifest with its own `sha256`.
`test/i8086-bios-source-provenance.test.mjs` runs offline on every CI leg: it
re-derives the source and assembler sha256s from disk against the manifest
(so a one-byte change to either reddens THAT input by name), then assembles the
vendored source with lite's own `i8086-asm.js` via exactly
`assemble(source, {format: 'com'})` into a temporary buffer — never back into
`static/roms`, the trap above — and asserts byte-equality with the committed
`.bin`, naming both inputs and their hashes on a mismatch. verifyRom is not
re-implemented; equality with the `.bin` the boot test runs inherits it. The
`BW_BOARD_DIR` live ancestry check in `test/i8086-bios-provenance.test.mjs`
stays as the online complement. Mutation-proven both ways (source byte → red
naming the source; assembler byte → red naming the assembler).

**The trap in front of the fix**, because someone will walk into it: a test that
writes into the artefact directory to check the artefact directory passes on its
second run no matter what. It overwrites the evidence with the thing it was supposed
to compare against, so the first run is the only real one and every run after is
self-confirming. It is the shortest thing that appears to work.

**The fix.** Build each generator into a temp dir, compare against the tracked file,
fail naming BOTH the artefact and the generator that no longer produces it.
**Limit, in the same breath:** it proves the tracked bytes are the current build,
never that the generator is correct. A wrong generator faithfully reproduced still
passes.

**When the artefact is a function of N vendored inputs** (lite's BIOS: `rom/bios.asm`
AND `i8086-asm.js`), the guard proves correspondence but not WHICH input broke it, and
the failure message is the only place that distinction can live: name every input and
its vendored sha, because partial re-vendoring is exactly the failure to catch, and a
bare "bytes differ" sends the reader to the wrong file (lego-a4).

**Counter-instance**, because it names the structural cure: bw-board's own BIOS does
not have this. `rom/bios.bin` is gitignored and untracked, so there is no shipped
binary to go stale — consumers build from `rom/bios.asm` and the tests execute what
they just built. Not shipping the artefact is the fix; the guard above is what you
need when you must ship it.

## Twenty-fifth species: THE CORPUS THAT COLLAPSED INSIDE A NAMESPACE (2026-09-06, lego-be, framed by brickwright-lite-ea)

A gate asserted that CHIP-REFUSALS.md lists every chip whose refusal can be
retracted. Three parts retract; the document names them as three lines. The
check was:

    assert.ok(section.includes(field), `${file}'s ${field} is not listed`)

Delete one of the three lines from the document and the check still passed.

`i8251` and `i8255` BOTH call their ledger `modeWarning`. So the loop ran over
three parts, and the membership test ran over the set of distinct FIELD NAMES,
which is two. Removing the usart line left the ppi line — a different part,
identical field name — satisfying the check on the usart's behalf.

This is species 1, and it is worth its own entry because of WHERE the collapse
hides. The catalogued instances lose their corpus visibly: an empty file list,
a glob that matched nothing, a loop that ran zero times. Here the corpus is not
empty and the loop runs the right number of times. What shrank is the set the
ASSERTION distinguishes, and it shrank because two members of a seven-element
set share a name in a namespace the test never looked at. Nothing about the
code says three became two. The word `field` says it, and only if you happen to
know that two chips chose the same one.

ea's sentence, which is the one to keep: *a gate whose corpus silently
collapsed from seven parts to five distinct names — species 1 with the collapse
hidden inside a namespace rather than in an empty list.*

**The general shape.** Any membership test whose key is an ATTRIBUTE of the
subject rather than the subject's IDENTITY will silently merge subjects that
share the attribute. It is invisible in review because the code reads
correctly: `includes(field)` is exactly what you meant, and it is wrong only
because `field` is not unique across the loop. The tell is the mismatch between
what the loop iterates (parts) and what the assertion tests (names) — and that
mismatch is one word long.

**The fix is keying by identity**: the assertion now requires a line that starts
with the part's own label AND contains the field, so `usart 8251.modeWarning`
cannot be satisfied by `ppi 8255.modeWarning`.

**How it was found, which is the transferable part.** Not by reading. Three
mutations were written for the new gate and run; two went red and one did not.
The one that did not is this. Reading the assertion after the fact, it still
looks right — the author had to go and check whether two chips really do share
a field name before believing the mutation rather than the code.

A gate whose mutation passes is not a weak gate. It is a gate that does not
test what its name says, and the only routine way to discover that is to break
the thing it claims to protect and watch it stay green.

**Context.** The gate exists because brickwright-lite-ea found that
`chipRefusals()` answers "what is refused NOW" for three parts (retracted
ledgers: 8259, 8251, 8255) and "what was EVER refused" for four (permanent
ledgers: 8237, YM3812, SB DSP, uPD765), with nothing in the row saying which —
measured on a real boot where the pic1 refusal lives from step 1,513 to 1,517
of 1,579,840. Two semantics wearing one shape; documented per part in
CHIP-REFUSALS.md and gated against the source. That gate is the one that had
this defect in it.

## Twenty-sixth species: RAW BYTES ON THE RUNNER'S TRANSPORT (2026-09-07, lego-b9)

**The shape.** `node --test` runs each file in a child and reads the child's stdout as a
stream of v8-serialized frames (`ff 0f`, a big-endian length, a payload). A `console.log`
in that child — the test's own, or from any code it loads — is written RAW to the same fd.
The parent tolerates that by scanning for the next frame header and calling everything
before it "stdout"; so a test that prints works, every time, until a burst of raw text moves
the pipe's chunk boundaries and one lands inside a two-byte header. Then the parent resyncs
on the payload's own bytes, reads a length from a double, and the FILE fails as
`uncaughtException: Unable to deserialize cloned data due to invalid or unsupported
version` at line 1:1 — a message that names no test, no line and no writer, and reads as a
runner bug.

**The instance.** `test/virtual-spike-extension-e2e` and `-classic-`: both evaluate the
bundled SPIKE extension with `Function('Scratch', source)`, and the bundle logs ~1.7 KB of
emoji-prefixed lines on load and connect ("🤖 [SPIKE] Extension loading…"). Captured with
`NODE_TEST_CONTEXT=child-v8 node file > raw.bin` and parsed frame by frame: 777 and 1,664
foreign bytes, every run, on Node 20 and 22 alike. Failure rate before the fix: 11 of 81 runs
of the e2e file on Node 20; twice in CI on Node 22 (main run 34092576969, and a branch run of
lego-be's). Called "known flake" once already.

**Why a gate cannot see it by looking at the test.** The writer is not in the test file; it
is in code the test loads, and it is a legitimate `console.log` in a browser extension. A
grep for `console.log` in `test/` finds nothing. The only place the bytes are visible is the
transport itself.

**What holds it now.** `scripts/lib/test-census-reporter.mjs` counts `test:stdout` bytes per
file (the parent's own accounting of what it took for raw text), `scripts/check-test-run.mjs`
names every writer on every run and is red above `--max-stdout-bytes` (0 in build.yml), and
the two tests capture the extension's console through `test/helpers/quiet-console.mjs`
(0 foreign bytes after; 0 failures in 100 runs on Node 22). The limit, stated: this sees
what the parent counted as stdout, which is the same scan that fails — a chunk that lands
inside a header is counted as a failure, not as bytes. The census is the budget; the failure
message is the tripwire; neither is "flaky".

**The rule.** A test child's stdout is not a log. A test that needs to print uses
`t.diagnostic()` (framed); code a test loads that prints gets a captured console; and a
`deserialize cloned data` failure is a WRITER to find (capture the raw stream and parse it),
never a re-run.

## Two instances from bw-board, 2026-09-07 (lego-a4; recorded by lego-ac)

**The twenty-fourth species now has its limit written by its own author.** bw-board's
`test/rom-demos-match-generators` rebuilds each of the ten demo generators into a throwaway
directory and compares bytes; `--out` was added to every builder precisely so the gate cannot
regenerate into `rom/` and overwrite its own evidence, and an eleventh test catches a demo
added without a line in the list. Reach verified by perturbing one opcode: red at byte 9,
naming both files. The limit, in the test header rather than left implicit: it proves the
tracked bytes are the CURRENT build, never that the generator is correct — a wrong generator
faithfully reproduced still passes. That is the species closing exactly as far as it can and
saying where it stops.

**An instance of LANES 13 refused before it was built.** The 'SF' soft-float table (N5-1)
needs IEEE-754 add, multiply and divide in Thumb-1 on a core with no FPU, no divide and no
CLZ, each checked against an oracle at the rounding edge. rp2040js exposes `onBreak`, so the
operators COULD be implemented in the host and called out through a breakpoint — far less
work, and much worse: the DoD's test is agreement with JavaScript's `Math`, and a JavaScript
implementation tested against JavaScript's `Math` measures itself. It would pass completely and
prove nothing. This is the one place we have hit where taking the shortcut also destroys the
evidence that it was taken, so the refusal is written at the decision point in bw-board's
ROADMAP, and the partial that landed (8f46f2c) is a 21-entry table whose every entry reaches a
quiet-NaN stub and returns — a diagnosis where there was a hang, with `2.5 + 1.0 ≠ 3.5`
asserted so the stop cannot go stale.

## Two in one file, in one hour, from one hand (2026-09-07, lego-be; recorded by lego-ac)

Vendoring the seven i8086 preset ROMs that had been 404 in the shipped UI, lego-be wrote a
boot gate per demo whose observable was `assert.ok(m.cpu)` plus a refusal scan. Replacing a
demo with 32 KiB of zeros left all eight tests green. Read, the assertion looks fine: "the
machine has a cpu and refused nothing structural" is a true sentence about a booted machine.
It is not a sentence about the demo. It was found by FIRING the mutation, not by reading, and
fixed with an observable per demo taken from the demo's own bw-board header and measured off a
real boot AND off a zero ROM before being written down (blink: the 8255 leaves its reset control
word and port B is driven; keyboard: IRQ1 unmasked while the rest stay masked; the five display
demos: a display revision bump). Zeroing any one ROM now reddens exactly that ROM's test.

The second, minutes earlier in the same file: the first boot attempt called `loadROM`/`load`;
the machine's loader is `loadRom(bytes, at)`, and every test SKIPPED. The skip was NAMED, which
is the only reason it was noticed — a silent skip would have read as seven passes and a report of
seven booting demos that had never been loaded.

The transferable sentence: a gate is finished when its mutation has been fired, not when its
assertion reads true; and a skip that does not say its own name is a pass that lies.

**A tooling variant of the same species (lego-be, the same night):** `grep` decided
`test/fetch-pinning.test.mjs` was binary — one box-drawing character is enough — and
SUPPRESSED its matches, returning an empty result indistinguishable from an empty set. Four
consecutive greps "proved" a constant did not exist, then that the file had no imports, then
that the census lived elsewhere; `head -c` showed it the whole time. Any grep over that file
needs `-a`, or it lies by omission. The instrument answered a question adjacent to the one asked,
and its silence read as a true negative.

## Twenty-seventh species: THE FACT THAT LIVES ONLY IN A WIRING EXPRESSION (2026-09-07, brickwright-lite-ea)

**A fact that lives only in a wiring expression is invisible to every test that
exercises the things being wired.**

The debugger's chip-refusal line had eight unit assertions and six proved
mutations. The collector worked. The line formatted. The panel read the handle.
The DOS bench produced the row in node in two milliseconds. Every one of those
was true while the feature was completely dead for the bench most programs
actually run on.

What was broken was one expression:

```js
chipRefusalsOf = typeof adapter.machine?.chipRefusals === 'function' ? … : null;
```

The DOS bench passes `adapter: {}` **on purpose** — its own comment says why, so
that `wireMachineBench` cannot offer a `loadRom` writing into the wrong place —
and its machine is reachable only on the bench object. So the runner concluded
"this machine cannot report refusals" about a bench carrying `ppi1`, `pit1` and
`spk` with a working ledger.

**Why the tests could not see it.** Each side was tested against a *constructed*
example: the model against rows built in the test, the bench against a machine
built in the test. The wiring is the one thing neither can construct — the runner
is not instantiable in Node — so it was the one thing nothing asserted. A gate
per component plus a gate per contract still leaves the joins uncovered, and the
joins are where a null lives.

**The tell.** It is not a wrong value; it is a *plausible absence*. `null` from
that expression rendered exactly like a bench with nothing to report, which is
the honest state for most benches most of the time. Absence is the hardest defect
to notice precisely because it is usually correct.

**What made it findable.** The panel published its own state — `'none'` when
there is no collector, `'empty'` when there is one that found nothing — and the
browser gate read it. Collapsed into one "no rows", three separate causes had
looked identical across three CI runs. Separated, the third named itself in one
word. *A diagnostic that distinguishes kinds of absence is worth more than one
that reports absence accurately.*

**The fix, and the shape to copy.** Hand the capability over explicitly rather
than discovering it by traversal — `chipRefusals: () => bench.machine.chipRefusals()`,
a read-only view and nothing else, preserving the reason the adapter is empty —
and then **assert the wiring by name**, in both directions, because it is
invisible from either side:

```js
assert.match(runner, /chipRefusals: \(\) => bench\.machine\.chipRefusals\(\)/, …)
assert.match(runner, /typeof result\.chipRefusals === 'function'/, …)
```

A source assertion is a poor substitute for a behavioural one and the right tool
when the behaviour has no reachable seam. The message says what BREAKS — "every
refusal a program produces on the Code tab is invisible to the panel" — not what
is missing.

**Not to be confused with the twenty-sixth** (RAW BYTES ON THE RUNNER'S TRANSPORT,
lego-b9): that one is a signal corrupted in transit, where the value arrives
wrong. This one is a value that never leaves, and arrives as a well-formed
`null` that means "nothing to report" — which is usually true.

**Its close sibling is the twenty-eighth species**, A CENSUS BY LITERAL CANNOT
SEE AN ASSEMBLED VALUE — three instances in one day, including the one that
blinded `rom-paths-exist.test.mjs`, the gate written for exactly that failure.
Same root, different remedy: a path census is widened to recognise construction,
while a capability is handed over explicitly rather than discovered by traversal.
Keeping them apart is deliberate; merging them buries the second fix.

## Twenty-eighth species: A CENSUS BY LITERAL CANNOT SEE AN ASSEMBLED VALUE (2026-09-07, lego-b9's detector, recurrence named by brickwright-lite-ea)

`test/rom-paths-exist.test.mjs` exists because `debug-runner.js` fetched
`bios8086.bin`, a filename that had never existed, and 404ed on every run for
weeks with nothing noticing. Its comment is unusually direct about what it is
for: *"what was wrong here was a STRING, and the only thing that can check a
string against the filesystem is a check that reads both."*

On 2026-09-07 it was hiding seven of the same defect.

The Machine Loader's presets name fifteen ROMs. Eight resolve. Seven are not in
`static/roms` at all — `i8086-cga-gfx-demo.bin`, `i8086-vga-demo.bin`,
`i8086-hercules-demo.bin`, `i8086-ega-demo.bin`, `i8086-keyboard-demo.bin`,
`i8086-desk-demo.bin`, `i8086-blink-demo.bin`. Seven visible, clickable buttons
that 404. (Counted twice, independently, by lego-be and by me.) The gate could
not see one of them, because the loader fetches

```js
const url = new URL(`static/roms/${p.rom}`, document.baseURI).href;   // :1784
```

and the gate looks for

```js
const REF = /['"`]static\/roms\/([A-Za-z0-9_.\-]+)['"`]/g;            // :36
```

A literal. **The path is assembled at runtime, so there is no literal to find,
so the census walks the overlay, matches nothing in that file, and reports
success about the paths it did find.**

**The failure is silent in the safe-looking direction.** A census that misses
entries does not error — it returns a shorter list and passes. Every property it
asserts about what it found is true. Nothing distinguishes "I checked fifteen and
all fifteen exist" from "I checked eight and all eight exist" except a number
nobody is comparing to anything. This is species 1 with the collapse hidden in a
regex rather than in an empty corpus, and it is worse than an empty corpus,
because an empty one is at least suspicious.

**Three instances in one day, in three unrelated files.**

1. **Docs read by construction.** `docs/*.md` reached through
   `join('docs', name)` were invisible to the trigger census, so a build could be
   skipped for a doc that a test actually reads. lego-b9 built the fix —
   `constructedTopLevelDocPaths` (`scripts/lib/doc-triggers.mjs:77`) — which finds
   `join('docs', variable)`, `` `docs/${…}` `` and `'docs/' + …` on non-comment
   lines, and fails by name. Gated in both directions on a fixture carrying all
   three shapes plus a commented one.

2. **Gate scripts spawned through a built path.** `test/gate-coverage.test.mjs`
   classifies a gate as exercised if a test spawns it. Neither real caller writes
   `scripts/<gate>`: `corpus-differential.test.mjs:21` and
   `sb1-converter-deferral.test.mjs:10` both do
   `join(…, 'scripts', '<gate>.mjs')` and pass the binding to `execFileSync`
   several lines later. Two successive rules — the literal, then the literal in
   the spawning statement — each called both of them orphans, in the file whose
   entire purpose is to avoid manufacturing false orphans. Fixed by
   `referencesGatePath` (`:197`), which recognises the construction.

3. **Preset ROMs**, above — the instance to lead with, because the blinded gate
   was the one written for this exact failure.

**Why it recurs.** Every one of these was written by someone who knew that a name
in a comment must not count, and solved that by keying on a quoted literal. The
literal is what makes the check strict. It is also what makes it blind, and the
two properties are the same property. You cannot loosen it toward "any mention"
without readmitting the comments; you have to teach it the *shapes of
construction* instead, which is a longer list and never provably complete.

**What to do, in order.**

- **Ask of every by-name census: what does the code do that I am matching on?**
  If any caller builds the value, the census is already short.
- **Recognise construction explicitly** — `join(a, b, 'name')`, template
  literals, concatenation — statement-bounded, never through a fixed-width
  window around the name (that is its own species).
- **Enumerate from the producing structure, not from the consuming string.**
  The preset list is a literal array in the source; every entry's `rom` is a
  literal even though the URL is not. A census that walked the presets and
  checked each ROM would have found all seven on the day the first one broke —
  and needs no regex over fetch sites at all. Where the producer is enumerable,
  enumerate it and stop guessing at the consumer.
- **Fail by name in both directions**, as lego-b9's does: a constructed path the
  census cannot resolve is a finding, not something to skip.

**Its sibling is species 27**, THE FACT THAT LIVES ONLY IN A WIRING EXPRESSION —
the same blindness applied to capabilities instead of paths, and the remedies
differ enough to keep them apart. A path census widens to see construction; a
capability is handed over explicitly rather than discovered by traversal.

**The same file, a third face (lego-be, ea; 2026-09-07):** rebasing over `test/fetch-pinning.test.mjs`
gave `UU` with NO conflict markers in the file — git also decides it is binary and cannot line-merge
it, so it leaves one side in place and marks the path unmerged; `grep -a '<<<<<<<'` finds nothing and
only `git status` says otherwise (resolve with `git show :2:` / `:3:` and merge by hand). ea then found
the byte: line 135 holds a LITERAL NUL inside the check that skips files containing NUL bytes —
`'\0'` was meant — so the binary-detection check made its own file binary, and every symptom (grep's
silence, the unreadable review diff, the marker-less conflict) follows from that one character. The
transferable sentence, lego-be's: reading a file out of a feature worktree is reading a SNAPSHOT;
`git show origin/main:<path>` after a fetch is the only thing that answers "what ships" — and ea's:
a claim about another lane's file is a claim about a tree, and the tree must be named.

## Twenty-ninth species: THE EDIT THAT MATCHED NOTHING AND SAID IT WORKED (2026-09-07, lego-be's incident, written up by brickwright-lite-ea)

A gate that cannot fail reports green about code it never checked. This is the
same silence one layer earlier, in the tool that writes the code: **a
find-and-replace whose pattern matches nothing applies no change and reports
success.** Nothing is red. Nothing is missing from the output. The file is simply
not what you think it is.

**The generalisation first, because it is the whole thing:** any tool that
locates by pattern and acts on what it finds — an editor, a codemod, a migration,
a `sed` in CI, a config templater — answers *"I did what you asked"* and *"I found
nothing to do"* with the same exit code, unless someone makes it not.

**The incident** (`test/vendor-absent-by-design.test.mjs`, lego-be, landed as
`594d5dde5`; the pre-landing sha `d46e151fc` was rebased away, and citing it
here would have named a commit main does not have). A test restoring a vendored tree without shelling out to `git`
gained two new uses in one change: `writeFileSync` for the restore loop,
`statSync` for the directory filter that keeps `readdirSync` from handing a
subdirectory to `readFileSync`. Two separate patches added them to the import.

**Both matched strings that were not in the file. Both applied to nothing. Both
reported success.** The import stayed as it had been across the two preceding
commits:

```js
import { readFileSync, readdirSync } from 'node:fs';
```

**IT COMPOSES, AND THAT IS THE SPECIES.** The run failed with `statSync is not
defined` — not because that gap was unrelated, but because it was the one the
runtime reached first. The author fixed that import, re-ran, and hit the second
silence; the tree came back dirty, and only then did reading the file replace
patching it.

So the appearance of *"a new, unrelated problem"* was itself produced by the
second instance of the same failure. One silent no-op is a bug you find. Two
silent no-ops in one change disguise each other: the first is hidden by the
second's symptom, and the second looks like the consequence of having fixed the
first. **Each hidden edit dresses the next as something else.**

The final import, once the file was read rather than patched:

```js
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
```

**Why it costs a diagnosis and not a retry.** An edit that fails loudly costs a
retry. This one sends you to look at the snapshot logic — reasonable, wrong, and
twenty minutes — because the observable symptom belongs to a different symbol
than the change you believe you just made.

**Its relatives, and the distinction is the useful part.**

- Species 28 is a **census** that cannot see an assembled value: it reads, finds
  fewer things than exist, and passes.
- This is a **mutation** that cannot find its target: it writes, changes
  nothing, and passes.

Reading and writing, same silence, opposite directions. Both are the tool
standing exactly where a false green would stand, which is why neither is caught
by the thing the tool was operating on.

**ONE STEP FURTHER BACK: THE PATTERN CAME FROM A VIEW OF THE FILE.** lego-be's
first probe patch anchored on text copied out of `sed 's/^/  /'` output — with
the two-space display prefix carried along. The replace could only ever be a
no-op. The same root produced at least one of the three anchor misses in the
8255 change: an assertion copied out of a terminal rendering rather than out of
the file, where a message ran longer than the visible fragment.

This is worth naming separately because the remedy differs. Refusing on a missing
anchor catches it — but only after the fact. What prevents it is knowing that **a
pattern copied from a rendering of a file is not a pattern from the file**:
terminal output with an indent prefix, a diff hunk with its `+`/`-` column, a
code block in a message that reflowed, a truncated line in a search result. By
the time the tool receives the pattern the provenance is gone and it cannot tell
the difference. Copy from the file; if you copy from a view, expect the anchor to
fail and let it.

**And the exposure is the default path, not an edge case.** Both sessions that
hit this pipe every command through `sed 's/^/  /'` for readability, so the
two-space prefix is on every line either of us has copied an anchor from all day.
Neither of us knows how many times it bit. It was noticed twice — once by
lego-be, once here — and **the failure mode is silence, so the count of the
times it was not noticed is not available to us.** An entry about tools that
report success while doing nothing cannot honestly claim to know its own
incidence.

**A note on how these get caught, because it is mostly not diligence.** lego-be's
first NUL sweep scanned all 11,370 tracked files and returned 1,759 hits —
almost all PNGs, where a NUL is not a defect. Every hit true, the whole answer
useless: *a count over the wrong set is not a smaller answer, it is a different
question.* It never reached anyone. But the reason was not care — the output was
too large to print, so it had to be read from a file, and reading it is what
showed what the hits were. Forty lines and it would have been skimmed and the
number sent. Catching a wrong-set measurement was, that time, a side effect of
its being too big to skim.

**The remedy is not care, it is refusal.** Assert every anchor before applying
any of them, and exit non-zero naming the anchor that was not found. Written that
way, a multi-part edit either lands whole or does not land:

```python
if old not in s:
    sys.exit('ANCHOR MISSING — the tree is not what this patch was written against')
```

Adopted here the same day, in the two-file change for the 8255 `at` fix, and it
**refused three times on one edit**: an assertion that was two lines rather than
one, then a message longer than the copied fragment, then a guard catching two
anchors that would have collided. A plain string replace would have applied part
of that change and reported success three times over. Three misses in one edit is
not bad luck — it is what a plain replace hides.

**The check to make of any such tool:** *what does it do when it matches
nothing?* If the answer is "succeeds", the next silent no-op is already written.

**The fourth face, and the worst one (lego-be, ea; 2026-09-07):** the first three faces of the NUL
in `test/fetch-pinning.test.mjs` — grep withholding matches, git refusing to line-merge, diffs
unreadable — each cost a diagnosis but announced itself as confusion. This one announced itself as
GREEN. T9's stale-pin census (`pin-move-chain.test.mjs`) skips any file containing a NUL, so for as
long as the byte was there the gate reported clean while an old bw-board pin (`a301937d9`, a fixture
value that happened to be a real former pin) sat at line 618 of a file the gate exists to scan. Proved
both ways on the same tree: NUL put back → 7 pass; NUL removed → red naming the sha (lego-be); and from
the other side, main + the one-character fix only, pin untouched → the same red (ea, four measurements).
The sentence that generalises past NULs: a file the tooling calls binary is a file your gates do not
read, and nothing in the run says so — any file-skip predicate inside a scanner (a NUL, a size cap, a
parse failure, a path pattern, a binary sniff) is a set the gate silently does not quantify over. An
instance of the twenty-eighth species one level down: a census that cannot see a FILE. The fixture is
now `'deadbeef'.repeat(5)`: a value that only needs to be 40 hex characters must not be a value that
means something elsewhere.

## Thirtieth species: THE LIST THAT VOUCHED FOR ITSELF (2026-09-07, lego-b9)

A gate that holds a hand-written list equal to a computed set has two directions:
*missing* (the set has something the list lacks) and *stale* (the list has
something the set lacks). **If the census that computes the set scans the list
itself, the stale direction can never fire** — every entry on the list is, by
being on the list, "mentioned" once.

**The incident.** `test/build-trigger-paths.test.mjs` holds build.yml's push
`paths` re-includes equal to "every `docs/*.md` some non-comment line of code
mentions". The census scans `test/`, `scripts/`, `overlay/` and `.github/` —
and build.yml lives in `.github/`. Its own line `- 'docs/X.md'` is a
non-comment line mentioning `docs/X.md`. So a doc re-included on 2026-09-06
because a reader named it stayed re-included after the reader left: the list
was its only remaining mention, and the test's stale direction said nothing.
Fired live before the fix: add `- 'docs/CI-QUEUE-2026-09-07.md'` (a doc no
code names) to the list — 5/5 green. Two docs were found this way
(`DEBUGGER-NEXT-ROADMAP.md`, `FULL-DEBUGGER-ARCHITECTURE.md`: their only
"mentions" were trigger entries in three workflows), and a third,
`LANGUAGE-DEVICE-MATRIX-PLAN.md`, was held by two generators that print its
name as markdown inside a template literal — a provenance line in a report,
which the census read as a mention. That one cost five main runs in a day
(docs/CI-QUEUE-2026-09-07-MAIN.md §3).

**The fix** (`scripts/lib/doc-triggers.mjs`): a workflow's own trigger entry
is not a mention; a doc name between escaped backticks is markdown being
printed, not a path being read, and is reported (`outputOnlyMentions`) rather
than counted. The test's probe for the stale direction is chosen at run time
(any doc nothing mentions) — a literal name in the test would itself have been a
mention, and it was, on the first attempt.

**The generalisation.** Whenever a gate compares a list to a census, ask what
the census scans, and whether the list is inside it. A paths filter, an
allowlist, a baseline file, a re-include list, a LANES ledger: each is a file of
names, and a name census that walks the tree will find it. The self-mention is
invisible because it is true — the list does mention the doc. The tell is a
direction of the test that has never been red: fire it once, on purpose, with
an entry nothing else names.


## Thirty-first species: A GATE WHOSE PRECONDITION A LATER GUARD CONSUMED (2026-09-07, lego-b9; lego-be's proof, lego-b9's guard)

Two correct things, written weeks apart by two hands, whose COMPOSITION cannot
run. Neither is wrong. Nothing in either file is stale. The gate reports a
failure that names the wrong subject, or — the case here — never reports at
all, because it was skipped in every run and nobody had a reason to look.

**The incident.** `test/vendor-absent-by-design.test.mjs` (lego-be) proves that
an UNSCOPED `sync-bw-board.mjs --dir <tree>` refuses the two absent-by-design
files by name instead of creating them. It needs upstream's default-branch TIP,
because the sync refuses a source BEHIND that tip before it reaches the check —
a precondition the proof knows about and skips by name for. Nothing in CI set
`BW_BOARD_HEAD_DIR`, so it had executed in none of 20 green main runs (plan T13
recorded that; plan T13c added the clone that supplies it).

The first run in which it ever executed (34145330880) went red on
`i8088-cycles.js was not refused by name` — reading as a broken refusal. The
refusal was fine. In between, plan T9b had added `scripts/lib-pin.mjs`: a file
sync never moves the pin, and a sync from a tree at any other sha WOULD move it,
so the run died with `PinMoveRefused` several steps before the check. A second
precondition, of exactly the kind the proof already handled once, added after
the proof was written, by someone who could not have seen the collision —
because the proof was skipped in every run they could have seen.

**Why it is its own species and not just a stale test.** A stale test refers to
something that changed. Here nothing either file refers to changed: the sync
still refuses by name, the guard still refuses pin moves, and both tests pass in
isolation. What changed is the ORDER of refusals on a path only one of them
walks. The composition had no owner, and no run exercised it. In CI the tip is
the pin only in the minutes after a bump, so the collision was not an edge case
either — it was the ordinary case, invisible for want of a single execution.

**The tell, and it is cheap:** a gate that is skipped in every run has no
evidence that its preconditions are still satisfiable — only that they were the
day it was written. `# SKIP` says something about THIS run; it says nothing
about whether the gate can run at all. Any repo that lets checks skip should be
able to answer, from its own logs, *which gates have never executed here* —
plan T13's census does that, and this species is what it found on the first one
it un-skipped.

**The fix, and the shape of it.** The proof now passes `--pin` — the lever that
permits the move — because pin discipline is `test/pin-only-moves-with-flag
.test.mjs`'s subject and per-file refusal is this one's; it snapshots and
restores `vendor-pins.json` beside the vendored files BEFORE any assertion, so a
failing assertion cannot leave a moved pin for the next hand to commit;
it byte-compares the pin at the end; and it asserts BY NAME that the pin guard
did not refuse this run, so the next guard to land ahead of it says so in one
line instead of costing another diagnosis. Mutation-proved by dropping `--pin`.

## Thirty-second species: A DOUBLE WHOSE ACCESSOR MINTS A NEW OBJECT (2026-09-07, brickwright-lite-ea; shape named by lego-b9)

The first species whose failure lives in the TEST'S OWN FIXTURES rather than in
the code, the gate, or the gate's reachability. **A test double whose accessor
returns a fresh object each call gives the test and the subject two different
objects with the same name.** The test then arranges the world on its copy,
the subject reads its own, and the assertion passes having measured nothing.

Note carefully what this is NOT. It is not "the gate cannot fail" — this gate
CAN fail, and does, for other reasons. It cannot fail for THE REASON IT CLAIMS.
It is not species 31 either: no precondition was consumed and nothing was
skipped. The divergence is one of IDENTITY, not reachability, and that is why it
needs its own entry.

**The incident.** `test/gpl-toolchain-not-bundled.test.mjs` asserts that a
PARTLY filled toolchain cache — the state a cancelled download leaves — degrades
to the origin per file instead of to broken. The fake Cache Storage was:

```js
open: async name => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name);
    return {match: async url => store.get(url), put: async (u, r) => store.set(u, r)};
}
```

Every `open()` builds a new wrapper. The test simulated the missing file by
patching `.match` on `await caches_.open(TOOLCHAIN_CACHE)`; `cachedResolver`
then called `open()` itself and got a DIFFERENT wrapper with the original
`.match`. The cache was never partial from the subject's side. The test passed,
and would have passed with the per-file fallback deleted — which is the whole
behaviour it exists to prove.

**The fix.** Memoise the wrapper per name, and simulate absence by deleting from
the underlying store rather than by patching the accessor's return value — the
absence a browser actually presents, reached the way the subject reaches it.

**The tell, which generalises well past caches.** Any double whose accessor
MINTS state will do this: `open()`, `getConnection()`, `createClient()`,
`session()`, `getInstance()`, a React context provider re-created per render, a
module mock re-instantiated per import. The symptom is always the same and is
easy to miss because it is a PASS: the test stays green when you break the thing
it is about.

**The check, and it is cheap.** Before trusting a double-based pass, run the
test against the BROKEN double — here, the un-memoised fake — and require it to
FAIL. A double-based test that has never been seen red proves only that it
compiles. This entry exists because that check was run: the pass was correct
afterwards and worthless before, and nothing else in the suite would have told
the difference.

**Why it was nearly missed.** The suite around it was green, the assertion read
correctly, and the fixture was eight lines of obvious code. Nothing about a
`Map` in a closure looks like a place where identity goes wrong. The failure is
invisible at the point of reading and visible only at the point of breaking.

**The same discipline, one level up.** Hours earlier in the same lane, a local
browser harness — CI's own build artifact served from disk — passed a gate 15/15
while CI reported `saw 0`, because the catalogue fetches when it opens and a
local disk read lands before the count where a hosted one does not. Same class
of mistake in a different fixture: a stand-in that is not the thing, trusted
because it was green. A double that never diverges from its subject and a
harness that never runs slower than production are the same wish, and neither is
free. The rule that catches both is the one above — make the stand-in fail on
purpose before believing it when it passes.

## Thirty-third species: THE PROXY EVENT STANDING IN FOR THE STATE (2026-09-07, lego-be; rule proposed by lego-ac, measured before building)

Every species so far is a gate whose SET is wrong. This one is a gate whose set
is right and whose QUESTION is a stand-in. **The check observes an event that
usually accompanies the state it cares about, instead of observing the state.**
It then inherits every case where the two come apart -- and they come apart in
both directions, so the gate over-refuses correct work AND can miss the defect,
with no way to tell which from its output.

**The incident, and it was caught before it shipped.** A vendored file carries a
promise: the recorded pin says this content IS upstream at that sha. Nothing
checked it. The proposed gate was *a commit touching a vendored path is refused
unless it also MOVES that upstream's pin* -- which reads as obviously right,
because a legitimate re-vendor does move the pin.

It was measured against 400 commits of real history before a line was written.
29 touch a vendored path; the rule refuses **10 of them**. One is a genuine
defect. The other nine are correct commits, including a forward-sync that copies
upstream content in at a pin that was ALREADY correct -- so there is nothing for
it to move, and the gate fires on the very operation vendoring exists for.

**Why the arithmetic is fatal rather than annoying.** One-in-ten precision does
not survive contact with the people it refuses. It does not get fixed; it gets
an `--allow-vendored-edit` flag inside a week, and a gate with an escape hatch
that nine in ten users must reach for is decoration with a CI cost. The species
is not "the rule was too strict". It is that **a proxy's false-positive rate is
a property of the proxy, not of the code**, so no amount of care in the codebase
reduces it.

**The tell.** Ask what the success predicate literally observes, then ask what
the invariant is ABOUT. Here: it observes *did this commit modify
vendor-pins.json*; the invariant is about *whether a file's content equals
upstream's*. Those are different sentences. Whenever the predicate names an
ACTION (a commit moved something, a script ran, a step was invoked) and the
invariant names a STATE (the content is X, the set equals Y), you are looking at
a proxy, and the only question left is how often they diverge.

Proxies are seductive because they are cheap to compute and usually right.
Species 28's census-by-literal is one (does the source TEXT contain the value,
standing in for does the runtime USE it). So is any check that greps for a
function call instead of measuring its effect.

**The fix is always the same shape: ask the thing itself.** After the commit,
does the file's content equal upstream at the pin this commit records? That is
the same move as `baseForFile` -- walk to what the content IS rather than
reasoning from what the commit DID -- and it separated all 29 commits cleanly
where the proxy could not. It is more expensive: it needs upstream's tree at the
pin on disk, which is why the proxy is tempting. Pay it.

**Two things the measurement produced that the proxy could never have.** First,
a FOURTH case the pin-move framing had no room for: seven lite-authored files
living inside a vendored root -- present in neither "matches upstream" nor
"declared divergence", because upstream has no such file to compare against.
Asking about content forces every file into a category and makes the leftovers
visible; asking about commits never enumerates files at all. Second, one of
those seven turned out to have no reason to be there -- nothing in the vendored
root imports it, both consumers are lite's own. That is a real finding, and it
came from having to write a reason per file rather than from any assertion.

**The corollary, and it is the general form of "measure first".** A gate is a
CLAIM ABOUT HISTORY. Run it over history before writing it. Ten minutes of
`git log` answered a design question that would otherwise have been settled by
argument, and the answer -- reject the rule, keep the goal -- was not the one
either party expected. The version of this that goes wrong is building the gate,
watching it red, and adding exemptions until it is green: same destination,
except the exemptions are now load-bearing and nobody remembers which were
principled.

## Thirty-fourth species: A GATE THAT MUTATES WHAT ANOTHER GATE MEASURES (2026-09-07, lego-be; negatives that made it findable by brickwright-lite-ea, framing by lego-ac)

Not a gate that cannot fail. A gate that makes a DIFFERENT gate fail, for a
reason neither of them contains. **One test writes to a path another test
reads, and the runner runs them at the same time.** The reader then measures a
state nobody put in a file and nobody meant to assert, and reports it in its own
vocabulary -- which is the vocabulary of a real defect.

**The signature, and it is the reason this costs so much to find.** The failure
NAMES REAL FILES. It CANNOT BE REPRODUCED. It CLEARS BY ITSELF on the next run
with nothing changed. Every one of those reads as noise, and the third one is
what usually ends the investigation: a red that went green is a red most people
stop looking at.

**The incident.** `test/vendor-absent-by-design.test.mjs` proves that an
unscoped `sync-bw-board.mjs` refuses two files by name. To do that it ran the
real sync against the LIVE worktree and put the files back afterwards. An
unscoped sync UPDATES vendored files that exist -- at this pin, exactly one:
`board.js`. `node --test` runs four files in parallel. So
`test/vendor-identity.test.mjs`, which walks that same directory comparing it to
upstream, could read `board.js` mid-sync and report

    APPEARED (new divergence nobody has written up): board.js

naming precisely the file the other test had just written.

**THE WINDOW WAS 69% OF THE RUN**, which is the measurement that turned this
from a plausible story into the answer. Two files racing did not reproduce it in
three attempts, so the window was measured directly instead -- poll the blob
hash of `board.js` from a concurrent process for the duration of the test:

    live-tree version : differed from the committed blob in 355 of 518 polls
    sandboxed version : 0 of 1006

A reader that touches that file while this test runs is MORE LIKELY THAN NOT to
see the wrong content. What made it look rare was not the window; it was that
only one other test reads that path and the two have to overlap.

**IT IS ATTRIBUTED TO THE INNOCENT BRANCH, and that is half the cost.** The
red lands on whatever else happened to be running, so every victim opens the
same investigation from the same false premise: *what does my change have to do
with vendored board files?* The honest answer is nothing, and reaching it takes
minutes each time. Three sessions did exactly that in one evening. Sighted on
main, on the pin leg that legitimately moves the pin -- and, most clearly, on a
branch carrying a ONE-NUMBER BALANCE CHANGE TO A GAME EXAMPLE, which failed
`upstream has not converged on the lite-only work` and could not possibly be
related to it. That third sighting is the one to keep: when the accused branch's
content is obviously unrelated to what the assertion names, the assertion is not
talking about the branch at all.

**Why every correct investigation missed it.** Three negatives were established,
each by measurement and each true: the pin did not move across the flip, the
lite tree did not move, and the reader does not consult the moving tip. Same
declared inputs, red then green. The conclusion drawn was "a third input exists
that nobody has enumerated" -- and the trap is that it is NOT AN INPUT. It is
what another process was doing to the filesystem at that instant. Ruling out
inputs one at a time is the right method and it cannot reach a cause that never
appears in the input list. **When every input is proved identical and the result
still varies, stop enumerating inputs and start enumerating WRITERS.**

**Restoring does not fix it, and believing it does is the actual error.** The
old code was careful: it snapshotted the files, restored them before any
assertion, and byte-compared the pin at the end. All of that closes the window
at the END. The window is the whole problem. A test that writes to a path any
other test reads is not isolated no matter how faithfully it cleans up.

**The fix is to not write there.** The sync now runs in a throwaway `git
worktree` at HEAD -- a few hundred milliseconds, shares the object store, and
carries everything the script needs. The live tree is never written at all,
which is strictly stronger than being put back, and it closes a hazard the file
had already documented as unclosable: a crash between sync and restore could
leave a moved pin, and there is no moved pin in that worktree now. The final
assertion changed to match. It used to say *the pin was put back*; it now says
*the live tree and the live pin were never touched*, and it is mutation-proved
by pointing the sync back at the live repo.

**Deriving the whole set, not just the instance.** Two sweeps: every test that
writes, removes or renames a file and never mentions a temp directory (none but
this one), and every test that EXECUTES a repo script, since a script writes
wherever it likes regardless of how careful its caller is. The second found
`ci-skip-census.test.mjs` reaching `gen-ci-skips.mjs` -- but it IMPORTS the
module rather than running it, and the write is guarded by an `isMain` check, so
it never fires. That is the shape to look for next time: not the test's own
writes, but the writes of whatever it invokes.

**The general form, and it is one line:** a suite that runs files in parallel has
no isolation the tests do not give it, so the question is never "does this test
clean up" but **"does this test write anywhere another test reads."**
