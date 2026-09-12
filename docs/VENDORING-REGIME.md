# The vendoring regime

How upstream packages get into brickwright-lite, and what stops work that belongs
upstream from quietly living here instead.

This is the standing statement. `VENDOR-DIRECTION-2026-09-06.md` is a dated
measurement and `VENDOR-DIVERGENCE-*.md` are the per-upstream ledgers; this file
is the rule they serve.

> ## THE POPULATION CHANGED ON 2026-09-12 — read this before the rest
>
> **Two of the three upstreams stopped being vendored.** `bw-board` and
> `bw-circuit-ui` are now npm dependencies pinned by git sha
> (`packages/scratch-gui/package.json`, `github:CrispStrobe/<repo>#<sha>`); their
> `overlay/`/`packages/` roots, their sync scripts, and the four gates that
> judged them — `vendor-identity`, `vendor-residue-ratchet`, `divergence-ratchet`,
> `vendor-absent-by-design` — are gone. **`sb3-creator` is the only vendored tree
> left**, and everything below that speaks in the present tense about three trees,
> a byte-identity walk, or a residue ratchet is history.
>
> The rule did not change. **It is enforced by construction now instead of by
> measurement**: a dependency cannot hold a divergence, because there is no local
> copy to edit. What survives as a *gate* is the pin discipline
> (`test/pinned-packages.test.mjs`: the sha lives in `vendor-pins.json` and three
> other files must derive from it, mutation-tested against wrong host, wrong owner
> and wrong repo) and the sb3-creator judge
> (`test/sb3-creator-vendor-identity.test.mjs`, the one step in
> `vendor-freshness.yml` that runs it, failing if it so much as skips).
>
> **This banner exists because the document under it was, for one day, a careful
> account of machinery that had been deleted.** § "The hole" had just been
> rewritten to stop describing a shipped thing as pending; the migration then made
> it describe a deleted thing as present. That is the same defect twice in two
> days, from opposite directions, and the second one arrived through a change
> nobody connected to this file. A document is not repaired by being made true
> once.

## The rule

**We hold no divergences.** Everything upstream produces is streamed down;
everything we write that belongs upstream is sent up. There is exactly one
class of exception: a transformation the **sync itself performs** and can
**derive** — and it must be derived, not written down.

That class had two members and now has one. The retired member was a vendored
file's deep `node_modules` import needing a different number of `../`, which
`scripts/lib/vendor-rewrites.mjs` derived from the vendored root; it left with
`bw-board`.

The surviving member is `sb3-creator`'s flatten-and-rewrite: the sync moves
`src/utils/<name>.js` to `src/lib/sb3-creator-<name>.js` and repoints the
relative imports to match. `vendor-rewrites.mjs` still holds it, and still
DERIVES it — `SB3_CREATOR_POSSIBLE_REWRITES` is computed from the file map, so a
rewrite cannot be written down without a mapped file behind it.

## The pipeline

Three upstreams are pinned by exact sha in `vendor-pins.json`. **One of them is
vendored; two are installed.**

| upstream | how it arrives | what holds it |
|---|---|---|
| `sb3-creator` | **vendored** — synced into `overlay/`, mirrored into `packages/` | the pipeline below |
| `bw-board` | **npm git-sha dependency** | `vendor-pins.json` -> `package.json` + `packages/scratch-gui/package.json` + the lockfile, derivation asserted by `test/pinned-packages.test.mjs` |
| `bw-circuit-ui` | **npm git-sha dependency** | same |

The pipeline, for the one tree that still has one:

| step | mechanism |
|---|---|
| **pin** | `vendor-pins.json` — an exact commit, never a branch |
| **sync** | `npm run sync:sb3creator -- --dir <checkout>` — a **three-way merge** against a per-file base, not a copy |
| **transform** | `scripts/lib/vendor-rewrites.mjs`, the rewrite derived from the file map |
| **mirror** | `overlay/scratch-gui/…` is the tracked source; `packages/scratch-gui/…` is the tree that builds |
| **integrate** | `npm run integrate` copies overlay into packages |

**`vendor-pins.json` is still the single source of the sha for all three**, which
is the reason a migration to packages did not become a second place to record a
commit. The two package specs and the lockfile are DERIVED from it and
`pinned-packages` reds if they drift — including if the spec points at another
host, another owner, or a similarly-named repo.

**The sync refuses rather than overwrites.** If taking upstream's version would
delete lite-only work, it reports `kept` and leaves the file alone. That refusal
is the sync/graft boundary: a refused file needs a hand merge and a decision, not
a flag. `vendor-source-guard` separately refuses a sync from a checkout that is
neither ancestor nor descendant of the upstream default branch, so a stale clone
cannot sync lite backwards.

## What stops a divergence appearing

**For `bw-board` and `bw-circuit-ui` the answer is now structural: there is no
vendored file to edit.** An edit to `node_modules/` is not tracked, does not
survive an install, and cannot reach a build that installs from the lockfile. The
gate is the pin derivation, not a comparison.

For `sb3-creator`, the surviving tree, editing a vendored file in lite:

| the edit | caught? | by |
|---|---|---|
| any byte difference from upstream-at-pin, after the sync's own rewrite | **yes, by name** | `sb3-creator-vendor-identity` — 14 of 14 compared, and the ONE step that runs it fails if it skips |
| **one mirror only** (overlay without packages, or the reverse) | **yes** | `overlay-packages-pairs` |
| a rewrite the file map does not justify | **yes** | `SB3_CREATOR_POSSIBLE_REWRITES` is derived from the map |
| syncing from a clone that is neither ancestor nor descendant of upstream's default branch | **yes** | `vendor-source-guard` |

**The table this replaces recorded a fourth row reading "NO — green", which was
the hole.** It is not reproducible here: sb3-creator's judge declares no files,
so every difference is undeclared and nothing is forgiven. See § "The hole".

The judge's question is not *"does this match upstream"* but **"is this what a
sync would produce"** — strictly stronger, since it still refuses every
difference a sync would not have made. That framing outlived the gate that first
carried it.

## What stops a divergence persisting

Two mechanisms. **One of them is gone and the reason it is gone is worth more
than the mechanism was.**

**The ratchet** (`test/divergence-ratchet.test.mjs`, RETIRED 2026-09-12 with the
two vendored roots) held the counts **exactly, not as a ceiling.** An increase
red because the divergence grew. A *decrease* also red, telling whoever paid it
down to write the smaller number. Terminal value zero. A ceiling would be
permission to spend the gap, which was not hypothetical: a neighbouring gate's
exemption cap admitted an entry under time pressure precisely because the count
was under the cap. **Keep the exact-in-both-directions rule; it is the part that
transfers.** The ratchet itself reached zero on 2026-09-11 and was deleted the
next day when its subject stopped existing, which is the correct end for a
counter and not a regression.

**The deadline** (`test/disposition-deadline.test.mjs`, added 2026-09-11) is new
and is the answer to *"what makes the upstream trip actually happen"*.

Every ledger entry carries a `disposition` — `upstream:` or `stays` — and now
also a **`markedAt`** date. An entry marked `upstream` that is still present
**30 days** later reds by name. There are exactly two remedies and the failure
text says both:

1. Send the work upstream, land it there, bump the pin, retire the entry.
2. Change the disposition to `stays` and say **why** it is ours to keep.

Leaving it is not available. **This gate is a clock, so it can red on a day
nobody pushed** — that is what a deadline is, and the failure names the entry,
its `markedAt`, and how many days over it is, so the red reads as what it is.

Thirty days is about four pin bumps at this repo's observed cadence: an overdue
entry has watched four syncs go past without being sent.

## The hole — named 2026-09-04, closed 2026-09-11, and its whole apparatus deleted 2026-09-12

**A file that was declared divergent for one reason accepted unlimited further
divergence.** Once a file had any ledger entry, `vendor-identity` classified its
*whole* byte-difference as `diverged` and accepted it. Every word of that is past
tense now: the ledger, the gate, and the two vendored trees they governed are all
gone.

It is kept because **the failure was in the SHAPE, and the shape is portable**:
one gate both declares an exemption and performs the comparison, so the
exemption's scope silently becomes the comparison's blind spot. Any future
vendored tree can grow it again in an afternoon.

**It cannot grow in `sb3-creator`, and for a structural reason rather than a
lucky one.** The two jobs live in two gates there:

    test/sb3-creator-vendor-identity.test.mjs   compares all 14 mapped files after
                                                the sync's rewrite. NO exemption path
                                                exists in it — nothing to declare,
                                                nothing forgiven.
    test/vendor-sb3creator-deltas.test.mjs      reads the ledger and asserts the
                                                reported delta set is EXACTLY the
                                                declared one, "no more and no fewer".

Declaring a delta cannot widen what the comparison forgives, because the
comparison forgives nothing. **That separation is the fix, and it was arrived at
independently rather than copied from this page.**

### The worked proof this section carried, and why it is not here any more

It read: changing `this.cycles += 4` to `+= 5` in `i8086-machine.js`, in both
mirrors, leaves every vendor gate green. On 2026-09-12 it stopped being
runnable — `i8086-machine.js` is no longer in this repository. The day before, it
had already stopped being TRUE for a different reason, and that one is the lesson:

    re-run 2026-09-12 at pin 53c3fdb, BW_BOARD_DIR at the pin, 189 files judged
      not ok 5 - no vendored bw-board file diverges from upstream at the pin
                 without being declared
      not ok 7 - upstream has not converged on the lite-only work
                   APPEARED (new divergence nobody has written up): i8086-machine.js

Nothing had been fixed and nothing had broken. The proof had an unstated
precondition — *pick a file that has a ledger entry* — and when the ledger reached
zero on 2026-09-11 there was no such file, so the edit landed in `undeclared`,
which was never forgiven. A sentence reporting a measured green had become a
sentence reporting a measured green **about nothing**, and went on reading as
current. **A demonstration that depends on a precondition states the
precondition, or it expires silently — and reads as current forever.**

**AND IT HAD BEEN COPIED, ONCE BACKWARDS.** Two files restated this experiment's
verdict instead of citing it: `scripts/lib/vendor-residue.mjs` said the edit
"reds nothing" (agreeing with the measurement) and
`test/vendor-residue-ratchet.test.mjs` said it "reds every other vendor gate"
(its exact inverse) — same edit, same file, same cited source. The inverted copy
sat in the header of the gate whose entire justification was that the edit reds
nothing, so the header argued the gate was unnecessary and nobody read it that
way. Both files were repaired to cite rather than restate on 2026-09-11 and both
were deleted on 2026-09-12. A conclusion copied away from its measurement has
nothing left to check it against, and the copies do not disagree loudly — they
disagree in two files nobody opens together.

## What closed it — three things, and only one of them is still standing

**Region attribution shipped (2026-09-11), a MECHANISM.**
`scripts/lib/vendor-residue.mjs` attributed each changed region to a declared
entry and `test/vendor-residue-ratchet.test.mjs` ratcheted the unattributed
remainder to zero, with both schema changes: a **`region`** per entry (derived by
running the attributor, never by inspection) with an optional **`block`** anchor,
and **`liteRemoved` and `liteBehind` as separate keys** — a decision that may
stand forever versus a debt that must reach zero, on separate counts and separate
deadlines (14 days for the debt, 30 for an `upstream` intention). Under one key a
ratchet cannot tell peace from obligation and its number stops meaning anything.
**Deleted 2026-09-12 with the trees it measured.**

**The ledger emptied (2026-09-11), a STATE.** Nothing declared, so nothing
forgiven. It would have ended the day one entry was added. **The ledger file is
gone.**

**The trees stopped being vendored (2026-09-12), a STRUCTURE.** There is no local
copy of `bw-board` or `bw-circuit-ui` to edit, so the class of defect has no
site. **This is the only one of the three that is still standing, and it protects
exactly the two upstreams that left.**

The ordering matters and is the reusable part. Written on 2026-09-11, this
section warned that a reader who took "the hole is closed" from the *state* would
trust the gates further than they could be trusted the next time a fork was
declared. That warning was correct and was overtaken within a day by a change of
*structure* — which is a better answer than either, and was not available to the
people arguing about the first two. **When a defect keeps needing a gate, the
question worth asking is whether the thing being gated should exist.**

## The one failure no ratchet could catch — and the rule outlived the ratchet

**A count that goes down for a convergence that has not occurred is a lie that looks
like progress.**

The ratchet was exact in both directions: it red if the number grew, and it red if the
number fell and nobody wrote the smaller one down. What it could not see was a retirement
that is *correct in form and premature in fact* — entries removed because the upstream
trip was made, before the trip actually **landed** and the pin **moved**. The count falls,
the ratchet is satisfied, and the ledger now claims upstream has something it does not.

The rule follows from what an entry means: an entry describes **what upstream lacks**.
Until the upstream change is on its default branch *and* `vendor-pins.json` names a commit
that contains it, upstream still lacks it, whatever anyone has pushed to a lane.

So a retirement belongs to the **pin bump**, never to the lane that does the upstreaming.
The lane makes the trip; the bump records that it arrived. Two commits, deliberately —
and only a person checking whether upstream actually has the thing can tell them apart,
because to every gate in this repo they look identical.

(Stated by `brickwright-lite-0c` on 2026-09-11, declining to retire four entries on the
lane that upstreamed them.)

**This survives the ratchet's deletion unchanged, and now applies to a DEPENDENCY
bump.** "Upstream has it" still means on upstream's default branch AND named by
the sha this repo installs. A `github:` spec is a pin with different syntax: the
same two commits, the same requirement that somebody look, and the same inability
of any gate here to tell a landed trip from a pushed lane.

## Three things that are not what they look like

**"Lite is behind" has two causes with opposite remedies.** Upstream moved and we
have not synced → run the sync. Or both sides grew the same code from a common
ancestor → running the sync **deletes a feature lite has**. The cheap
discriminator is identical error strings on both sides: independent
implementations do not coin the same message. Read the lines; a count cannot
tell them apart.

*(The second cause is now possible only for `sb3-creator`. A dependency has no
local copy that can have grown anything, so "behind" there has exactly one
meaning and exactly one remedy: bump the sha. That is a real reduction in what a
reader has to think about, and it is the strongest practical argument the
migration made.)*

**A ledger's entries describe what a file HAS, so they are blind to what it
deliberately LACKS.** Adopting upstream wholesale for a file with a `liteRemoved`
section re-imports a dependency we removed on purpose — measured, it would have
written an import of a file that does not exist. When a file carries any removal,
merge **downstream-based**: start from the vendored copy and change only the
region being converged.

**A necessary companion of declared work goes upstream, not into the ledger.**
Declaring it grows a count whose only acceptable direction is zero, and converts
a thing to fix into a thing we have blessed.
