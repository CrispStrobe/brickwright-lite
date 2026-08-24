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

## CLAIMS — work in progress

| lane | who | started | what |
| --- | --- | --- | --- |
| release 0.1.7 | coordinating session | 2026-08-24 | version bump + tester notes prepared. The TAG PUSH is deliberately NOT done: it uploads to App Store Connect and reaches external testers, so it waits for the owner |
| lite fetch pinning | coordinating session | 2026-08-24 | bw-audit's four findings for THIS repo: sync-sb3creator/sync-examples fetch `REF='main'`, vendor-forward clones with no ref, sync-emu8051-wasm pins a 7-char sha, 47 unpinned `uses:` across 6 workflows |

## DONE — recently, so nobody redoes it

| lane | who | landed | what |
| --- | --- | --- | --- |
| provenance / pins | bw-audit | `3beb78d` (sb3-creator) | audited every place either repo asserts what it verified; 11 action tags and 2 dep ranges pinned, a Pages fetch made sha-addressed, and a gate of its own found vacuous and recorded. MERGED — suite 6496/6400/0, prover 31/31 |
| schematic viewer | bw-circuit-ui | `def49c7fb040ba9f5cc76a1f4e9fa36d16e06856` | Second audit pass, which audited the DETECTORS rather than the drawing on the grounds that ten classes reporting zero from detectors written by the same hand is an untested claim. Five more real classes, all now 0/2098 and mutation-proved: a net's conductor ENDING on another's (426 circuits / 3,461), a shared corner (85 / 218), collinear within 4px (426 / 1,807), a solver-connected terminal with NO drawn pin (365 / 763 — an ATtiny88 drawn with no power at all), a label leader touching foreign copper (43 / 86). Two of my own detectors were disproved rather than reported (one over-counted 14x by treating legal X-crossings as contact). **Class H had been aimed at exactly the collinear case and read 0** because it inspected only `w.trunk` wires, and the previous fix had just converted 799 circuits' trunks into `segments` detours — a fix that relocated a defect past its own gate. 21 reviewed SVG baselines. CI 32704664707. |
| attiny88 footprint | bw-circuit-ui | `d4224262f88fd616502fc573309cc7edd3093e8a` | Picks up where `eac7a1a`'s canon measurement left off. The PDIP-28 top row ran in the wrong column order and **there were TWO footprints carrying it**: `src/model/footprints.js` (14/14 columns wrong) and `src/parts-data/attiny88.json` (8/14, and mirrored against the built-in). `FOOTPRINTS` is a Proxy where the built-in WINS, so fixing only the sidecar — the obvious move — changes nothing; 54 sidecar footprints are shadowed and inert. New `test/footprint-chirality.test.js`: a DIP may be seated rotated 180° but never MIRRORED, and the cross-product sign is exactly that invariant. Survey with denominators: 78 built-ins, 25 multi-row, 14 of 17 comparable pairs mirrored (ratchet, may only shrink). **Also corrects the record on the withdrawn gate** — design 3 was called "provably useless" on a mutation of 74hc595's SIDECAR, which the Proxy never reads, so it was green because nothing moved. **NOT CLAIMED, DO NOT START WITHOUT READING PLAN.md:** pin 22 is still named `pa0` (the package has no PA0; it is a second GND) because bw-board owns terminal NAMES and the canvas looks positions up BY NAME — renaming here alone renders it at the part origin. Ordered: bw-board, then this repo and bw-parts, then re-seat. **Rule 5:** this moves attiny88 seating geometry (13 of 28 legs), so whenever sb3-creator bumps its pinned `bw-circuit-ui@410f8ce`, its 135 attiny88 circuits need `gen-device-benches` re-seating with assert-physics and kcl-residual measured either side. Nothing moves until that pin is bumped. |
| easyeda export review | bw-circuit-ui | `06ffb68cccacaa5256687b2f18a2009219ea9c0c` | Adversarial review of the native exporter for the session that wrote it (not my lane; findings theirs, fixed in `953dc53`/`3304bcc`). Read the exported dialect with an INDEPENDENT reader sharing no code with our importer, because exporter and importer are two halves of one understanding and a shared assumption is invisible to a round trip. Found a drawn short in 2 of 2,098 files: a bottom escape's horizontal leg walked into the lane band. **The honest correction, which I sent after they had adopted my framing:** their round trip was NOT blind to it (36 classes vs 37 on the broken build) — the DENOMINATOR was, because the sweep read bare `circuit.json` and the `circuit-flat.<target>.json` twins were outside it. Same hyphen-vs-`\.` gap that cost my own lane a re-run. The instrument is kept as a script and deliberately NOT wired into `npm test`. |
| EXPECTED.md claims | bw-corpus | `3beb78d` (sb3-creator) | branch complete and MERGED to main by the coordinating session; suite 6496/6400/0, prover 31/31 |
| provenance / pins | bw-audit | `3beb78d` (sb3-creator) | branch complete and MERGED to main by the coordinating session; suite 6496/6400/0, prover 31/31 |
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
