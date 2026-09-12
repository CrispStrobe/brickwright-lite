# The vendoring regime

How upstream packages get into brickwright-lite, and what stops work that belongs
upstream from quietly living here instead.

This is the standing statement. `VENDOR-DIRECTION-2026-09-06.md` is a dated
measurement and `VENDOR-DIVERGENCE-*.md` are the per-upstream ledgers; this file
is the rule they serve.

## The rule

**We hold no divergences.** Everything upstream produces is streamed down;
everything we write that belongs upstream is sent up. There is exactly one
class of exception: a transformation the **sync itself performs** and can
**derive** — and it must be derived, not written down.

Today that class has one member: a vendored file's deep import of
`node_modules` needs a different number of `../` than upstream's copy, because
the file lands at a different depth. `scripts/lib/vendor-rewrites.mjs` computes
that depth from the vendored root rather than recording it, and a test refuses
any rewrite entry that writes a `../` run of its own.

## The pipeline

Three upstreams are vendored, each pinned by exact sha in `vendor-pins.json`:
`bw-board`, `bw-circuit-ui`, `sb3-creator`.

| step | mechanism |
|---|---|
| **pin** | `vendor-pins.json` — an exact commit, never a branch |
| **sync** | `npm run sync:bwboard -- --dir <checkout>` — a **three-way merge** against a per-file base, not a copy |
| **transform** | `scripts/lib/vendor-rewrites.mjs`, depth derived |
| **mirror** | `overlay/scratch-gui/…` is the tracked source; `packages/scratch-gui/…` is the tree that builds |
| **integrate** | `npm run integrate` copies overlay into packages |

**The sync refuses rather than overwrites.** If taking upstream's version would
delete lite-only work, it reports `kept` and leaves the file alone. That refusal
is the sync/graft boundary: a refused file needs a hand merge and a decision, not
a flag. `vendor-source-guard` separately refuses a sync from a checkout that is
neither ancestor nor descendant of the upstream default branch, so a stale clone
cannot sync lite backwards.

## What stops a divergence appearing

Measured by construction on 2026-09-11, editing a vendored file in lite:

| the edit | caught? | by |
|---|---|---|
| an **undeclared** vendored file | **yes, by name** | `vendor-identity` — *"APPEARED (new divergence nobody has written up)"* |
| a declared file, **one mirror only** | **yes** | `overlay-packages-pairs` |
| a declared file, both mirrors, **adding a new identifier** | **yes** | the identifier-coverage check |
| a declared file, both mirrors, **behaviour only, no new names** | **NO — green** | *nothing. See "The hole" below.* |

`vendor-identity`'s question is not *"does this match upstream"* but **"is this
what a sync would produce"** — strictly stronger, since it still refuses every
difference a sync would not have made.

## What stops a divergence persisting

Two mechanisms, and they do different jobs.

**The ratchet** (`test/divergence-ratchet.test.mjs`) holds the counts **exactly,
not as a ceiling.** An increase reds because the divergence grew. A *decrease*
also reds, telling whoever paid it down to write the smaller number. Terminal
value zero. A ceiling would be permission to spend the gap, which is not
hypothetical: a neighbouring gate's exemption cap admitted an entry under time
pressure precisely because the count was under the cap.

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

## The hole — named 2026-09-04, and the demonstration it carried has expired

**A file that is declared divergent for one reason accepts unlimited further
divergence.** Once a file has any ledger entry, `vendor-identity` classifies its
*whole* byte-difference as `diverged` and accepts it. That is still a true
statement about the mechanism.

**THE WORKED PROOF UNDER IT IS NO LONGER TRUE, AND IT DID NOT FAIL — IT
EXPIRED.** It read: changing `this.cycles += 4` to `+= 5` in `i8086-machine.js`,
in both mirrors, leaves every vendor gate green. Re-run 2026-09-12 at the pin
(`BW_BOARD_DIR` at `53c3fdb`, 189 files judged), the identical two-line edit reds
`vendor-identity` twice, each naming the file:

```
not ok 5 - no vendored bw-board file diverges from upstream at the pin without being declared
not ok 7 - upstream has not converged on the lite-only work
             APPEARED (new divergence nobody has written up): i8086-machine.js
```

It does not red because the hole was patched. It reds because `i8086-machine.js`
is no longer a *declared* file — the ledger is empty, so the edit lands in
`undeclared`, which was never forgiven in the first place. The proof had an
unstated precondition (*"pick a file that has an entry"*), and when the last
entry left, a sentence claiming a measured green became a sentence claiming a
measured green about nothing. **A demonstration that depends on a precondition
states the precondition, or it expires silently — and reads as current forever.**

**AND IT HAD BEEN COPIED, ONCE BACKWARDS.** Two files restated this experiment's
verdict instead of citing it: `scripts/lib/vendor-residue.mjs` said the edit
"reds nothing" (agreeing with the measurement) and
`test/vendor-residue-ratchet.test.mjs` said it "reds every other vendor gate"
(its exact inverse) — same edit, same file, same cited source. The inverted copy
sat in the header of the gate whose entire justification is that the edit reds
nothing, so the header argued the gate was unnecessary and nobody read it that
way. Both now cite this section and state no verdict of their own. A conclusion
copied away from its measurement has nothing left to check it against, and the
copies do not disagree loudly — they disagree in two files nobody opens together.

## What closed it, and why only one of the two counts

**Region attribution shipped** — `scripts/lib/vendor-residue.mjs` attributes each
changed region to a declared entry, `test/vendor-residue-ratchet.test.mjs`
ratchets the unattributed remainder, and both schema changes went with it: a
**`region`** per entry (derived by running the attributor, never by inspection)
with an optional **`block`** anchor where a region holds both declared and
undeclared work; and **`liteRemoved` and `liteBehind` as separate keys** —
`liteRemoved` is *"we decided not to have this"*, a decision that may
legitimately stand forever, `liteBehind` is *"we have not caught up"*, a debt
that must reach zero. Under one key a ratchet cannot tell peace from obligation
and its number stops meaning anything; they now carry separate counts and
separate deadlines (14 days for the debt, 30 for an `upstream` intention).

**And the ledger emptied**, so nothing is declared and nothing is forgiven.

Only the first is a mechanism. The second is a *state*, and it ends on the day
one entry is added. A reader who takes "the hole is closed" from the emptiness
will trust the gates further than they can be trusted the next time a fork is
declared — which is the same mistake as the expired proof above, made in the
opposite direction. What holds on that day is the residue ratchet, and its
terminal `RESIDUE = {}` is asserted rather than assumed: the first file to come
back reds `THE REAL LEDGER IS EMPTY — measured, not inferred from a quiet gate`
by name, and the region checks that read the live ledger are proved against a
fabricated one (`SYNTHETIC_BAD`) so their silence over an empty ledger is worth
something. A regrowth cannot arrive quietly; it arrives as a fork to send
upstream.

## The one failure no ratchet can catch

**A count that goes down for a convergence that has not occurred is a lie that looks
like progress.**

The ratchet is exact in both directions: it reds if the number grows, and it reds if the
number falls and nobody wrote the smaller one down. What it cannot see is a retirement
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

## Three things that are not what they look like

**"Lite is behind" has two causes with opposite remedies.** Upstream moved and we
have not synced → run the sync. Or both sides grew the same code from a common
ancestor → running the sync **deletes a feature lite has**. The cheap
discriminator is identical error strings on both sides: independent
implementations do not coin the same message. Read the lines; a count cannot
tell them apart.

**A ledger's entries describe what a file HAS, so they are blind to what it
deliberately LACKS.** Adopting upstream wholesale for a file with a `liteRemoved`
section re-imports a dependency we removed on purpose — measured, it would have
written an import of a file that does not exist. When a file carries any removal,
merge **downstream-based**: start from the vendored copy and change only the
region being converged.

**A necessary companion of declared work goes upstream, not into the ledger.**
Declaring it grows a count whose only acceptable direction is zero, and converts
a thing to fix into a thing we have blessed.
