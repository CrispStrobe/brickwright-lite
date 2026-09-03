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
`exit 2`s with a named message; `oracle-simavr` rejects with the tool's own stderr;
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

### The sixth shape: SWALLOWED-PRECONDITION

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
workflow step swallows exit 2 as a warning — also defensible on its own. Together they meant the
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

