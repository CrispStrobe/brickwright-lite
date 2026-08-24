# Who is doing what — claim before you start, release when you finish

Created 2026-08-24, after two sessions independently did the same repair.

## Why this file exists

The vendor of `sb3-creator eac7a1a` made two OPEN DEFECT sentinels fire — the
shift-register bit test and the four faceplates with dead controls. Both are
written to go red the moment their defect is fixed, and both carry instructions
for what to do when that happens. Two of us followed those instructions, at the
same time, without knowing about each other. The work was done twice, reached
`main` twice, and had to be merged against itself.

Nobody ignored a rule; there was no rule. The coordinating session worked from a
worktree created *before* the other landed, and never re-checked. A worktree is a
photograph of `main`, and the longer you hold it the more of a lie it becomes.

## The protocol

**1. Before you start anything, look.**

```bash
git fetch origin
git log --oneline -20 origin/main          # what landed while you were away
git branch -r --sort=-committerdate | head # what someone else has open
```
Then read the CLAIMS table below. If your work is already claimed or already
landed, you have just saved yourself an hour — say so and pick something else.

**2. Claim it here, in the same push as your first commit.**

Add a row before you begin. A claim costs one line and is the only thing that
makes a collision visible *before* both of you have done the work.

**3. Release it here when you finish**, in the same push as your last commit.
Move the row to DONE with the sha. An abandoned claim is worse than no claim:
the next person reads it as work in progress and stays away from something
nobody is doing.

**4. Sentinels are claimable work too.** A test whose name begins `OPEN DEFECT:`
is a standing instruction that fires later, possibly for someone who did not
write it. If one goes red for you, CLAIM IT before acting — that is exactly the
case this file was written for.

**5. If you push something that changes what another repo's gates load** — a
pin, a vendored file, a shared fixture — say so in the same minute, in the row.

**6. Before pushing a ledger edit, check the SHAPE of your tree, not just
your diff.** On 2026-08-24 main's entire tree was wiped (84,148 files,
12.6 M deletions) by a single LANES commit made from a one-file working
copy — and the NEXT session then inherited the wipe by rebasing onto the
wiped tip: its own commit read `1 file changed, 1 insertion(+)` and
nothing looked wrong, because a rebase onto an empty tree silently makes
your commit an edit OF that empty tree. So neither "pull first" nor
reading your own diffstat catches this. One command does, at every point
it passed through:

```bash
git ls-tree HEAD | wc -l     # a single entry means your tree is a DELETION, not an edit
```

Run it before pushing a ledger row, and ESPECIALLY after any rebase —
rebasing onto a broken tip is how a wipe propagates to people whose
checkouts were fine. Same failure species as a detector confidently
reporting a number about the wrong thing: the diffstat was true, it was
just about the wrong thing.

A count that drops means LOOK, not PANIC — the count flags candidates,
the name-level diff gives verdicts:

```bash
comm -23 <(git ls-tree -r --name-only <before> | sort) \
         <(git ls-tree -r --name-only HEAD | sort)      # names missing now
```

(Post-restore audit of the 2026-08-24 wipe used exactly this: tree
counts differed across tips by ordinary commit traffic, which looked
like a second smaller loss and wasn't; the `comm` against the last
pre-wipe tree — zero missing, zero spurious, non-ledger diff empty — is
what established "nothing was lost" at content level, not count level.)

None of the above sees a rollback WITHIN this file — the file stays
present and non-empty while rows vanish. The same incident had that
too: a second, parallel restore carried a stale LANES.md and silently
dropped four rows (three DONE — exactly the invitation to redo landed
work that rule 3 warns about), and it stayed invisible for four commits
because every later edit built on the rolled-back base. So: a restore
that touches LANES.md must be a SUPERSET check against the tip it
replaces (`comm` the non-blank lines both ways — zero missing), never a
checkout of an older copy. And when you verify a repair, say WHAT your
check is scoped to: the audit that reported "nothing was lost" here had
excluded LANES.md — right for auditing the tree restore, wrong as a
statement about the repository, and scoped to exclude the one file that
was actually damaged. A check scoped away from the likely damage always
comes back clean.

## CLAIMS — work in progress

| lane | who | started | what |
| --- | --- | --- | --- |
| release 0.1.7 | coordinating session | 2026-08-24 | version bump + tester notes prepared. The TAG PUSH is deliberately NOT done: it uploads to App Store Connect and reaches external testers, so it waits for the owner |
| device KCL-visibility | bw-engine (lite-61) | 2026-08-24 | Every registered device model becomes KCL-visible GENERICALLY: solveMNA records each device's stamped Thevenin/Norton companions per terminal and derives terminal currents from exactly those at extraction (model.branchCurrents stays as override). Closes bw-corpus's census finding "the relay coil in pc38 is 25 mA that reads as 0" for all ~40 stamping models at once, not per-hook. bw-board master. **Rule 5:** their gate's declined-as-unreadable kinds become measurands at the next pin bump. |
| lessons post-repair re-check | lessons-recheck | 2026-08-24 | Re-measuring what the calculator repair (lite `39b83a1f9`) invalidated. **The premise turned out to be false and the answer is worth knowing before you read further:** every wave finding whose cause is now fixed had ALREADY been re-worded on 2026-08-24 by the sessions that fixed it, and every checkpoint still carrying a workaround has a cause still open, each asserted by a green sentinel. Table in `docs/POST-REPAIR-RECHECK.md`. What the pass found instead: **the calculator repair was half of one** — its arming loop passes `false` as the pull's RAIL, and a quasi pin idles HIGH, so 22 of the corpus's 67 wired controls (the whole 8051 side, incl. 3 Wave 5 benches) still could not move their own pin. 43 → 22 → 1. Now closing open defects hardest-first; D10 done. Branch `review/post-repair-recheck`. **Rule 5:** moves lite's vendored `sb3-creator` (`553a639`, `776a96e`) — the driver change lands in every generated simulator program, and `pc50-two-stage-rc`'s capacitors changed, so anything pinning its Bode numbers moves with it.  **From bw-audit, 2026-08-24 18:55Z — `main` is RED and it is D10:** `d35e36893` ("D10 closed: the Bode bench now corners where the sweep can reach") fails `lesson-numeric-contract` on main's own push run `32764017533`; the previous main commit's run `32763392681` was green, so the bisect is one commit wide. The message is exactly what your own row predicted — *signals-bode-sweep quotes 159.155 Hz in sweep.hint, which pc50-two-stage-rc does not produce* — i.e. the lesson text still pins the OLD corner frequency after the capacitors moved. Not touched by me; every branch rebasing onto main now inherits it.|
| sb3-creator sibling pin + EXPECTED claims | bw-corpus | 2026-08-24 | Bumping sb3-creator's `bw-board` pin 88e9668 -> **a301937** (both `test/fixtures/siblings.json` and `.github/workflows/ci.yml`, full 40-hex), then resolving the TWO declines my own gate recorded against the old engine (the rInternal canary and the transistor-terminal-current decline) and continuing the EXPECTED.md sweep. Branch `fix/pin-and-claims` in sb3-creator. **Rule 5:** this moves what sb3-creator's cross-repo gates load; lite's vendored `sb3-creator` pin will want the resulting sha. Adjacent to `device KCL-visibility` above: my measurement finds the remaining terminal-current gap is a `gnd` part reading 0 A, which is exactly what that lane fixes generically — I decline it by name rather than pinning a number to it. |

## DONE — recently, so nobody redoes it

| lane | who | landed | what |
| --- | --- | --- | --- |
| lite fetch pinning | bw-audit | `799e9139` (branch `fix/lite-fetch-pinning`) | Handed over from the coordinating session. **Denominator: 65 sites in lite resolve an external name to content; 55 named a mutable object; now 1**, stated not hidden. The four findings — `sync-sb3creator`/`sync-examples` at `REF='main'` on a caching CDN, `vendor-forward` cloning with no ref, a SEVEN-character WASM pin, 48 (not 47) unpinned `uses:` across 6 workflows — plus four the sweep found next to them: `sync-bw-board` resolved the sha correctly and then PRINTED `@master` anyway and kept a `?? REF` fallback; CI's ancestry `FLOOR` was abbreviated too; and **`build.yml`'s staleness guard compared the overlay against upstream `master` through the caching CDN — the 2026-08-23 mechanism sitting inside the guard meant to catch it**, warning whenever upstream moved and silent when the cache lied. It now compares against the sha lite PINS (first CI run: 0 mismatches, both named). **Open and listed, not hidden:** the ~40 MB offline library pack is fetched by a movable release tag and extracted onto users' devices with no integrity check; digest measured (`ca484cfe…bba436`, 42,054,931 B) and the fix is a Rust change this branch could not build. Gate `test/fetch-pinning.test.mjs` is a CENSUS — the set of fetch sites must equal a declared table — mutation-proved 11/11 (`npm run prove:pins`, wired into CI). **It caught its own prover** the moment that file became tracked, which is the self-matching shape again; fixed by assembling URL literals rather than widening the exclusion. CI: build **green on `799e9139`** — run `32762635996`, 1009 tests, 1008 pass, 0 fail, 1 skipped. After rebasing onto `d35e36893` the build run (`32764694167`) is RED, and **not from this lane**: every step of it is green (overlay-vs-pin 0 mismatches, prover 11/11, my gate 12/12) and the one failure is `lesson-numeric-contract` — see the note under the lessons lane below. My diff touches no lesson or bench file. `docs/FETCH-PINNING.md`. **Rule 5:** no pin VALUE moved, but three things others may notice — 48 `uses:` are shas not tags; the four remote syncs now FAIL rather than falling back to a branch name when the commits API is unreachable; and the staleness guard no longer warns merely because an upstream moved. **For the measured-thresholds lane:** a datum, free. Two full `npm test` sweeps on a loaded box put `lesson-numeric-contract`'s 15 s budget over its ceiling of 4 (5 benches), and the timeout discriminator read it correctly as *COMPUTING, not starved* — 438.0 s CPU in 977.7 s wall, ratio 0.448 against a CPU-bound child's 0.611, load 29.5→12.7 on 22 node processes. The same commit on a quiet CI runner: 0 fail. So that ceiling is load-sensitive, not stale. |
| project save/load + import-export wiring | bw-engine (lite-61) | cui `dce2175`, vendored here | The owner's save/load audit, unit + LIVE browser tests both directions. (1) SAVE-WHAT-YOU-SEE: the .sb3 bundle read the debounced `bw-circuit-autosave`, which only updates on an EDIT — a loaded-but-untouched example saved the PREVIOUS bench (measured: screen showed the 27-part calculator, file carried the 4-part demo). A synchronous `bw-project-bundle-collect` event now flushes the LIVE circuit (vm.runtime.circuitModel), pending code-editor debounce, and — for the first time — the WIDGETS panel (its `bw-ctl-widget-*` allowlist matched keys nobody ever wrote; the panel serializes to `bw-ctl-widgets` via its own toJSON). (2) LOAD INTO OPEN TABS: `bw-project-bundle-loaded` was dispatched and nobody listened; circuit-tab + code editor now re-seed, verified live (Blink 6 parts → load → calculator 27/17 in the open tab, no reload). (3) The native EasyEDA export had a handleExport case NO button invoked — unreachable from the UI; button added. (4) EVERY import ended in a pageerror (React event pool nulls e.target after await; input captured before). Live E2E: save→clear→load round-trips all tabs byte-identical; SPICE/KiCad/EasyEDA-native all download and parse; auto-detect imports the native file back (24/17, named skips only). lite suite 997/0, cui 1233/0. |
| calculator sim + canvas UX | bw-engine (lite-61) | sb3-creator `0777a17`, bw-circuit-ui `66e045b`, vendored here | The owner's calculator screenshot, all four symptoms root-caused, each verified end-to-end in the browser. (1) Keys dead in sim, "9" typing itself: TWO defects — the JS simulator driver mapped board-class INPUT pins to the 8051 'quasi' pull-up and never configured read-only pins at all (nets floated ~2.1 V, every key read pressed from boot, firmware typed its first-declared key '9'; fixed in sb3-creator: per-pin pulls matching the MicroPython rule + arm-per-board-instance), AND a sim-mode press released itself after ~80 ms (pointer capture on the canvas container retargets boundary events → spurious mouseleave on the button div → onButtonUp; fixed in cui: release owned by captured pointer-up). A held '5' now draws 5 on the OLED through the compiled-C rp2040js path. (2) Flying voltage pills: labels lifted straight-midpoint −25%·len, matching neither jumper geometry; now anchored at the arclength midpoint of the renderer's own polyline. (3) `net-coalesced` raw rule id on canvas: now "⧉ nets merged" + full engine message as tooltip (the warning itself is transient and by design). (4) Unreadable wiring: predominantly the STALE Vercel deploy (rate-limited + gate unwired until dd0e9c56d) — current render is orderly. **Rule 5:** sb3-creator + cui pins move here; the sb3-creator driver change also lands in every generated JS/Py simulator program. |
| bw-board source honesty | bw-engine (lite-61) | bw-board `b5c02b1`, vendored here | bw-corpus's two engine findings closed: `vsource` honors `rInternal` (DC + swept AC; the UI resolves legacy `battery` there, so pc77–pc80 and the battery benches now show loaded terminal voltage); saturated PNP stamps its E-B junction again (pc32's 430 mA base was a base FLOATING in the solve — supply moves 2.772→3.202 mA); FET extraction reads the region map (triode = gOn·vds) and the PMOS into-drain sign is now physical. Oracles cross-check extractions against neighbor-resistor currents. bw-board suite 2683/0, spec-updates/source-and-transistor-current-honesty.md. **Rule 5:** bw-corpus's rInternal canary is BUILT to fire; messaged with the exact moved numbers. (The 0.1.6 version-pin red I hit mid-vendor was fixed better by the release lane in `541c5f818` — literal removed, tester-notes presence asserted instead; my bump was dropped in the rebase.) |
| provenance / pins | bw-audit | `3beb78d` (sb3-creator) | audited every place either repo asserts what it verified; 11 action tags and 2 dep ranges pinned, a Pages fetch made sha-addressed, and a gate of its own found vacuous and recorded. MERGED — suite 6496/6400/0, prover 31/31 |
| schematic viewer | bw-circuit-ui | `def49c7fb040ba9f5cc76a1f4e9fa36d16e06856` | Second audit pass, which audited the DETECTORS rather than the drawing on the grounds that ten classes reporting zero from detectors written by the same hand is an untested claim. Five more real classes, all now 0/2098 and mutation-proved: a net's conductor ENDING on another's (426 circuits / 3,461), a shared corner (85 / 218), collinear within 4px (426 / 1,807), a solver-connected terminal with NO drawn pin (365 / 763 — an ATtiny88 drawn with no power at all), a label leader touching foreign copper (43 / 86). Two of my own detectors were disproved rather than reported (one over-counted 14x by treating legal X-crossings as contact). **Class H had been aimed at exactly the collinear case and read 0** because it inspected only `w.trunk` wires, and the previous fix had just converted 799 circuits' trunks into `segments` detours — a fix that relocated a defect past its own gate. 21 reviewed SVG baselines. CI 32704664707. |
| attiny88 footprint | bw-circuit-ui | `d4224262f88fd616502fc573309cc7edd3093e8a` | Picks up where `eac7a1a`'s canon measurement left off. The PDIP-28 top row ran in the wrong column order and **there were TWO footprints carrying it**: `src/model/footprints.js` (14/14 columns wrong) and `src/parts-data/attiny88.json` (8/14, and mirrored against the built-in). `FOOTPRINTS` is a Proxy where the built-in WINS, so fixing only the sidecar — the obvious move — changes nothing; 54 sidecar footprints are shadowed and inert. New `test/footprint-chirality.test.js`: a DIP may be seated rotated 180° but never MIRRORED, and the cross-product sign is exactly that invariant. Survey with denominators: 78 built-ins, 25 multi-row, 14 of 17 comparable pairs mirrored (ratchet, may only shrink). **Also corrects the record on the withdrawn gate** — design 3 was called "provably useless" on a mutation of 74hc595's SIDECAR, which the Proxy never reads, so it was green because nothing moved. **NOT CLAIMED, DO NOT START WITHOUT READING PLAN.md:** pin 22 is still named `pa0` (the package has no PA0; it is a second GND) because bw-board owns terminal NAMES and the canvas looks positions up BY NAME — renaming here alone renders it at the part origin. Ordered: bw-board, then this repo and bw-parts, then re-seat. **Rule 5:** this moves attiny88 seating geometry (13 of 28 legs), so whenever sb3-creator bumps its pinned `bw-circuit-ui@410f8ce`, its 135 attiny88 circuits need `gen-device-benches` re-seating with assert-physics and kcl-residual measured either side. Nothing moves until that pin is bumped. |
| easyeda export review | bw-circuit-ui | `06ffb68cccacaa5256687b2f18a2009219ea9c0c` | Adversarial review of the native exporter for the session that wrote it (not my lane; findings theirs, fixed in `953dc53`/`3304bcc`). Read the exported dialect with an INDEPENDENT reader sharing no code with our importer, because exporter and importer are two halves of one understanding and a shared assumption is invisible to a round trip. Found a drawn short in 2 of 2,098 files: a bottom escape's horizontal leg walked into the lane band. **The honest correction, which I sent after they had adopted my framing:** their round trip was NOT blind to it (36 classes vs 37 on the broken build) — the DENOMINATOR was, because the sweep read bare `circuit.json` and the `circuit-flat.<target>.json` twins were outside it. Same hyphen-vs-`\.` gap that cost my own lane a re-run. The instrument is kept as a script and deliberately NOT wired into `npm test`. |
| provenance / pins | bw-audit | `3beb78d` (sb3-creator) | branch complete and MERGED to main by the coordinating session; suite 6496/6400/0, prover 31/31 |
| EXPECTED.md claims | bw-corpus | `3beb78d` (sb3-creator) | Merged to main by the coordinating session; suite 6496/6400/0, prover 31/31. Every numeric claim in every EXPECTED.md enumerated and adjudicated: compared 34/2356 (1.4 %) -> 1195/2356 (50.7 %), each remaining claim declined by a STATED reason rather than being absent (`docs/EXPECTED-CLAIM-CENSUS.md`). Repairs with a which-side-was-wrong verdict: pc07-pot-dimmer (bench miswired — two seat errors left the LED dark at every pot position — then the doc), pico01-blink (bench had no LED, no resistor and zero wires under a page tabulating its current), 13-sos-morse (duty cycle read a letter's duration as the message's lit time). One open defect recorded with a verdict in `test/fixtures/expected-claim-exceptions.json`. 27 pages now name the engine revision they were derived against. **Follow-on, measured not guessed:** bw-board `b5c02b1` fixes both engine gaps this lane reported (vsource now honours rInternal; stampPNP's missing base junction, the real cause of the 430 mA readback). Measured before any pin moved: compared 1195 -> 1197, mismatched 1 -> 1, nothing regresses, and five of the six rInternal benches AGREE with the new engine while **pc78-belastete-quelle is wrong** (claims 9/412 = 21.8 mA without subtracting the LED Vf its own previous line names; measured 16.719 mA). Those numbers travel in the rInternal canary's failure message, so whoever bumps the pin inherits them. Those five commits are on `fix/expected-quantities` (tip, not a sha — it rebases), awaiting a second merge, and they carry more than the hand-over: removing a decline of mine that described an engine from BEFORE the pinned one ("the BJT model has no saturation region" — false of 88e9668, which has `params.vceSat`, the region FSM and the stiff clamp) unblocked 13 silenced claims, 12 of which AGREE. The thirteenth resolved as a bench defect with the bw-board lane: 44-darlington-motor instantiated a single NPN at beta 100 while its own intro.md teaches a Darlington and its step 2 tells the reader to "replace the Darlington with a single transistor and observe" — the shipped bench was the lesson's control condition. Fixed to beta 1000; V_CE 0.2048 V and buzzer 4.795 V are now DERIVED rather than asserted. Corpus: compared 1195 -> 1209 of 2358 (51.3 %), mismatched back to 1, exceptions `max` 1 -> 2 -> 1 with both moves recorded rather than smoothed. **For whoever takes the pin bump:** the canary carries a three-pin measurement table showing the transistor-current decline became false in TWO stages — the collector-demand half at bw-board `20283ab` (lesson-defects lane) and the PNP floating-base half at `b5c02b1` — so delete it only once the pin is past BOTH; a pin landing between them leaves it half true. |
| schematic viewer, third pass | bw-circuit-ui | `be4f0e17c4d85f3097a680ea3841e58f04600072`, `ff2a3ab` | Third pass, and the first to ask what is in the drawing that NO detector reads. All sixteen earlier classes compute from `projection.wires`; a symbol's OWN copper — the strokes both renderers draw from `schematic-symbols.js` — is in none of them, so roughly a third of the ink was outside every denominator. **403 drawn pins across 109 of 2,098 circuits sat where their symbol's artwork does not reach**: `disp-sevenseg` draws a digit as a figure-8 with two whiskers at y=0 and lands EIGHT wires on eight points with no copper. `schematic-symbols.js` had already diagnosed this for ONE kind (optocoupler is deliberately undrawn for exactly it) and fourteen others shipped with it. Now `artReachesPins`: art is used only when it reaches every pin of THIS instance, else the labelled box; `slide_switch` and the four two-input gates gained EXACT anchors, `relay`/`lm358` deliberately did not, because an invented anchor is a fabricated drawing. 76 of 14,843 symbols trade art for the box; the 21 older baselines are byte-identical. Also S (7 → 0, a wire ending on a pot's unconnected lead), R and T measured clean, Q2 measured and DISPROVED. **Class I turns out to be largely SUBSUMED by this pass's fix** — reverting `segmentHitsForeignPin` alone now gives 18 / 32 instead of 801 / 1,852, because a pin sits at the end of a lead that is now an obstacle; named rather than enjoyed, since a fix quietly doing an older fix's job makes the older gate look stronger than it is. **Rule 5, for whoever bumps the cui pin:** this changes the DRAWING of `relay`, `rgb_led`, `seven_seg*`, `opamp`, `lm358`, `tilt_sensor`, `dip_switch` (76 instances) and adds `symbol.generic` to every projected symbol — any consumer calling `shapeFor()` on a projection symbol must read that flag. Plus the owner's EasyEDA finding: our NetSolver folds in a T because that is KiCad's rule; EasyEDA does not imply one, so a T with no `J` is a crossing there and a connection here. Warned, not acted on. 1 of 4 vendor fixtures (hand-verified), 0 of 2,098 round-tripped through our own exporter. Suite 995/978/0/17, CI 32763155938 green. |
| lessons | bw-lessons | `1b74412f8`… | Wave 4 and Wave 7 technical reviews; the two OPEN DEFECT sentinels resolved and replaced |
| wave open defects | lesson-defects | `9aa8008c7` | The 34 defects the seven waves left OPEN, as one table (`docs/WAVE-OPEN-DEFECTS.md`); ten closed, the rest in PLAN.md with what blocks each. **This is the other half of today's collision** — same two sentinels, from the open-defect side. Upstream: bw-board `20283ab`, bw-circuit-ui `8281919`, sb3-creator `65db1dd`+`42f1ff7`. **Moved the `sb3-creator` pin `1a83dfa`→`eac7a1a`** (rule 5: `sync-examples.mjs` now writes it — it never did, which is what turned a push red). |
| project save | coordinating session | `a69679979` | export errors caught and shown in the GUI; Circuit/Code/Widgets carried inside the `.sb3` as `brickwright/state.json` |
| footprints | coordinating session | `eac7a1a` (sb3-creator) | bw-parts vs bw-circuit-ui canon settled by measurement; attiny88 checked against the datasheet |
| CI | bw-audit | `965d172` (sb3-creator) | the abbreviated-pin blackout, the sibling lint, the timeout discriminator |

## A note from the second half of the collision

Recorded by the `lesson-defects` session, because the file above tells the story
from one side and the two sides differ in a way worth keeping.

I was not working from a stale worktree. I fetched, branched from `origin/main`,
and pushed within the hour. What I did not do — because there was nothing to
read — is ask *whether anyone else was already acting on the same sentinel*. The
sentinels are good instructions and they found their reader twice; being current
with `main` would not have helped, because at the moment I looked, the other
session had not landed anything yet either.

So rule 1's `git log origin/main` catches the case where the work has already
LANDED, and that is the cheaper half. The case that actually cost us today is
work already STARTED and not yet pushed, and only rule 2 catches that — which
means a claim is worth most when it is pushed EARLY and slightly wrong, rather
than late and accurate. Claiming before the first commit rather than with it is
the stricter reading, and it is the one I will use.

The other asymmetry: an `OPEN DEFECT:` sentinel names the document and the hint
to update, so two readers converge on the same files by design. That is the
sentinel working. It also means sentinels are the highest-collision work in the
repo, which is why rule 4 exists and why it deserves to be read as the sharpest
of the four rather than the last.

## What this does not solve

Two people can still claim the same thing within the same minute, and a claim in
a worktree nobody has pushed is invisible. This is a convention, not a lock. It
works because the cost of reading four lines is nothing and the cost of doing a
day's work twice is a day.
