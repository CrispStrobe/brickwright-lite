# `bw-board/i8086-machine.js` has diverged BOTH WAYS

Discovered 2026-09-04 while trying to vendor the NE2000 into lite.

> ## AND IT NOW HAS A DEADLINE — owner ruling, 2026-09-11
>
> **Every entry carries `markedAt`, the date its disposition was assigned. An entry
> marked `upstream` that is still here 30 days later REDS by name**
> (`test/disposition-deadline.test.mjs`).
>
> Inverting the default made every entry argue for staying. It did not make anything
> leave: a `disposition: upstream` was an intention with no date behind it, and an
> intention nobody acts on is a decision not to act. The ratchet stops the COUNT
> drifting; nothing stopped an entry sitting at the same count forever.
>
> Two remedies, and no third. **Send the work upstream, land it, bump the pin, retire
> the entry** — or **change the disposition to `stays` and say why it is ours.** The
> gate is a clock, so it can red on a day nobody pushed; that is what a deadline is.
>
> Thirty days is about four pin bumps at this repo's cadence. See
> `docs/VENDORING-REGIME.md` for the whole regime and for what is still NOT enforced.

> ## THE DEFAULT IS NOW INVERTED — owner ruling, 2026-09-10
>
> **Everything in this ledger goes UPSTREAM. An entry that stays needs a MEASURED
> reason written into it — not a history.**
>
> Every checkpoint entry below carried the same "why": *"Forward-ported here and
> never upstreamed."* That is a description of what happened, and it had been
> doing the work of a justification. Nothing in this document said why anything
> **should** stay downstream — only that it had not moved.
>
> The three things that would have been blockers were measured on 2026-09-10 and
> none of them holds:
>
> | claimed blocker | measured |
> |---|---|
> | the vendored tree must have no outward dependencies | **10 of 11** divergent and lite-authored files are self-contained. Only `w65c02-cycle-provider.js` imports outside the tree (`../bw-debug/conditional-cycle-provider.js`). |
> | licence — bw-board is MIT, Lite is BSD-3 | Both are `Copyright (c) CrispStrobe`. **The same author.** Relicensing your own code is a decision, not a constraint. |
> | "never upstreamed" | A history, not a reason. Recorded in every entry, argued in none. |
>
> **So an entry's `why` must now answer a different question.** It used to record
> what the lite-only work IS. It must now also record why it is still here — and
> "it has always been here" is not an answer. Two shapes are acceptable:
>
> - **`upstream: <lane or sha>`** — going up, or gone up, with where to look.
> - **`stays: <measured reason>`** — with the measurement, not the assertion.
>   `resolve-netlist.js` is the model: *zero importers inside the vendored tree,
>   two in Lite's own runtime* — so it moves OUT rather than up, and the count
>   that says so is in the entry.
>
> **An entry with neither is an entry nobody has decided.** That is the state this
> ledger was in for its whole life, and the reason a day of work moved the file
> count from 14 to 11 while the real block — 18 of 33 entries, one module — sat
> untouched because its `why` read like a reason.

    lite has that upstream does not:   165 lines
    upstream has that lite does not:    84 lines

**`npm run sync:bwboard` would DELETE the 165.** The tool says so itself and
refuses to guess — *"A difference can mean the vendored copy is BEHIND
upstream, or AHEAD of it, and this comparison cannot tell which."* It is right,
and this file is the case it was warning about.

## What each side has

**Lite-only — a host-renderer optimisation nobody has upstreamed.**
`displayRevision`, a monotonic token bumped on visible VRAM and CRTC-register
writes rather than on every instruction, so the renderer can skip repaints. It
is real work, it is not in bw-board, and **a sync deletes it silently** — the
machine still constructs, the screen just repaints on every frame again and
nobody notices until someone profiles.

**Upstream-only — three things, all landed on master today.**
The NE2000 chip kind and its `REGS` entry; the port-conflict check; and
lego-a4's expanded comment on why the advance schedule must stay lazy.

## What was done, and what was not

**Grafted by hand into lite:** the NE2000 wiring and the port-conflict check.
Both are small, purely additive, and were written by the person doing the
grafting — which is the only reason it was acceptable. Verified afterwards that
`displayRevision` survived, that an NE2000 constructs, and that a conflicting
board is refused.

**NOT done: the reconciliation.** `displayRevision` should be upstreamed to
bw-board so this file can be synced normally again. I did not do it because **I
do not know why it diverged** — whether it is finished, whether the renderer
contract it serves is settled, or whether bw-board's other machines want the
same token. Guessing at someone else's design in a shared file is how the
divergence got here.

## Until then

- **Do not run a plain `sync:bwboard` on this file.** Use `--check` and read
  the direction first. The tool will not stop you; it will only tell you it
  cannot tell.
- **Anything landing in bw-board's `i8086-machine.js` has to be grafted**, by
  someone who knows what the hunk does. That cost compounds: it was four lines
  today and it will not stay four lines.
- **This is the second file in this shape.** `CircuitDesigner.jsx` is 19 ahead
  and 46 behind (see `VENDOR-DIVERGENCE-BW-CIRCUIT-UI.md`). Two is a pattern:
  vendored trees acquire local edits, and nothing warns until someone tries to
  sync.

## The general shape, for whoever meets the third one

A vendored file that is *behind* is an inconvenience — sync it. A vendored file
that is *ahead* is a fork nobody declared. A file that is **both** cannot be
resolved by any tool, because the tool has no way to know which of two changes
was the intended one. The only repair is a person who understands both sides,
and the only prevention is upstreaming local edits while they are still small
enough to remember.

---

# The allow-list below is executable

Updated 2026-09-05. Everything above this line is prose, and prose is what
let this file rot for a day: it recorded a divergence accurately and then had
no way to notice when the numbers changed. They had. It said lite was behind
on three upstream items; all three have since been grafted, and the counts it
quotes (165/84) are now 173/229.

**A document that describes a divergence cannot detect one.** So the list
below is not a description — `test/vendor-identity-i8086-machine.test.mjs`
parses this JSON block and asserts it. Editing the prose changes nothing;
editing this block changes what is enforced.

The technique is one the kerotakis lane put more sharply than I had it:
**assert an invariant BETWEEN two things, never a property OF each.** Two
copies each passing their own suite proves both are self-consistent and says
exactly nothing about whether they are the same, which is the only question
here. The disease is not too few tests on either half; it is that no test
fails unless it touched both.

## What each entry means

- `id` — stable name, quoted by the failure message.
- `why` — why lite has this and upstream does not. Read it before deleting.
- `falsifiable` — **the one sentence a non-programmer could check.** The
  kerotakis lane's rule, and the counter to "green to green, nobody thanks
  you": state the defect in terms of the WORLD, not the diff. "The discount
  was applied per-call" is unrewarding; "the bench says the volcano gets
  warm" is a thing a person can disprove with a finger on the beaker. Same
  change, and only one of them is a story. **If you cannot write this
  sentence, the entry is probably ambient and you have found another gate
  that cannot fail.** If you can, you have both the bug report and the test
  name.
- `contains` — a regex asserted to MATCH the vendored copy and NOT MATCH
  upstream. Containment-style, not a character window: see
  GATES-THAT-CANNOT-FAIL.md on why proximity is not governance.

## What fails, and what that means

- **A sync deleted lite-only work** → the entry's `contains` stops matching
  the vendored copy. Names the `id`. This is the 173-line silent loss the
  prose above warned about, made loud.
- **Upstream converged** → `contains` starts matching upstream too. The entry
  is obsolete; delete it from this block. The doc cannot go stale in this
  direction either, because agreeing with upstream is now a failure.
- **The two vendored copies drifted** → `overlay/` and `packages/` are
  dual-tracked in this repo; both are checked. I created a divergence between
  them once by not force-adding an ignored path.

```json
{
  "upstreamRepo": "bw-board",
  "vendoredRoots": [
    "overlay/scratch-gui/src/lib/bw-board",
    "packages/scratch-gui/src/lib/bw-board"
  ],
  "notIdentifiers": [
    "for",
    "if",
    "while",
    "switch",
    "catch",
    "return",
    "do",
    "else",
    "function"
  ],
  "files": {
    "m6502-debug.js": {
      "liteOnly": [
        {
          "id": "m6502-debug-replay-boundary",
          "disposition": "stays -- AND LEAVES THIS LEDGER'S SCOPE. Re-grafted at the 2026-09-11 pin bump rather than lost to a wholesale take: `replayToInputBoundary` has ZERO occurrences anywhere in upstream src/, and three consumers here (instruction-replay.js, timed-replay-io.js, and its own tests). MEASURED by simulating the take -- a wholesale copy reds m6502-timed-input-replay with 'the target does not implement replayToInputBoundary'. It is not a divergence to converge: it is a missing feature on two targets plus two consumers that disagree about the absence, one raising a NAMED replay error and one a raw TypeError. Needs a design decision and its own lane.",
          "markedAt": "2026-09-11",
          "falsifiable": "Reverse-stepping to a recorded input lands somewhere else, or accepts a malformed boundary and runs to an arbitrary point instead of saying the boundary was invalid.",
          "why": "replayToInputBoundary() parses the boundary as a BigInt inside a try and returns a CODED refusal ('invalid-input-boundary') rather than throwing or coercing. A NaN tick count that is silently accepted replays to the wrong place and reports success.",
          "contains": "replayToInputBoundary\\(boundary\\)",
          "region": "replayToInputBoundary"
        }
      ]
    }
  },
  "lineLevelOnly": {
    "files": [],
    "disposition": "EMPTY since the 2026-09-11 pin bump. All six converged: debug-target-factory, emu8051-debug, i8086-adapter, i8086-debug, m6502-adapter and z80-adapter are now byte-identical to upstream at the pin. Kept as a CATEGORY rather than deleted, because a file acquiring undeclared-identifier line divergence needs somewhere to be recorded, and an absent key reads as \"never considered\"."
  },
  "liteAuthored": {
    "disposition": "DISPOSITION 2026-09-11, after the bump: TWO left of six. floooh-z80-cycle-provider.js, z80-cycle-debug.js and z80-target-factory.js went UPSTREAM (bw-board 8300d79) and are now plain vendored files. w65c02-cycle-provider.js RELOCATED out of the vendored root to bw-debug/, where its only consumer and its own dependency live -- upstream gained the seam (opts.providerBoundary) and not the JSMoo rejection record, which is lite's. LICENSE is permanent: attribution travels with the copy. resolve-netlist.js moves OUT rather than up -- zero importers inside the vendored tree, two in lite's own runtime.",
    "markedAt": "2026-09-10",
    "why": "THE MIRROR IMAGE OF absentByDesign BELOW. That list records files upstream has and lite deliberately does not; this one records files LITE has and upstream does not -- lite-authored source living inside a vendored root. Seven as of 2026-09-07, found while measuring a proposed vendored-path gate. They were not invisible: test/vendor-identity.test.mjs has printed them since lego-b9 added the liteOnly and notCompared collectors this morning. But printed is not asserted, and nothing said which of the seven were deliberate. A lite-authored file in a vendored directory is one careless sync from being clobbered and has no upstream to restore it from, so each one is now a decision recorded once rather than an accident nobody has examined. THE REASON MUST SAY WHY IT LIVES HERE RATHER THAN BESIDE LITE'S OWN CODE -- six of the seven are reached by relative import from a vendored sibling that itself carries a declared divergence, which is a real constraint; resolve-netlist.js is not, and its entry says so.",
    "ratchet": "Entries may be REMOVED freely -- a file that moves out or lands upstream should leave. An entry may only be ADDED together with its reason in the same commit, and the gate refuses any lite-authored file that is not listed, so adding the file without the reason cannot go green.",
    "files": {
      "resolve-netlist.js": {
        "reason": "THE ONE WITH NO REASON TO BE HERE, and it is recorded rather than moved because moving it is a change to running code and this entry is not. NOTHING in the vendored root imports it: both consumers are lite's own -- bw-debug/debug-runner.js and pico-sim-run.js -- and upstream has no counterpart. It was extracted from debug-runner.js in 41d5f0cbb so the bare-metal debug path and the MicroPython Run resolve the board the same way, and it landed in the vendored directory rather than beside either caller. It is load-bearing (the phantom-inferred-bench rejection, owner reports 2026-08-16/17), which is exactly why it should not be sitting where a sync operates. MOVING IT TO bw-debug/ IS A SEPARATE LANE; this entry exists so that decision is asked rather than forgotten.",
        "importedBy": []
      },
      "LICENSE": {
        "reason": "Upstream's licence text, carried with the vendored copy so the terms travel with the code rather than living only in a manifest. Upstream keeps it at the repository root, not under src/, so it has no counterpart at the path this comparison walks. Attribution, not code. Declared 2026-09-07 when the gate's walk became recursive and every-extension: it had been invisible while the walk filtered `.js`, along with the 55 files of the devices/ subtree, all of which proved byte-identical.",
        "importedBy": []
      }
    }
  },
  "absentByDesign": {
    "i8088-cycles.js": {
      "falsifiable": "Lite passes {CycleEstimator} to enableI8088CycleTiming somewhere, at which point it needs both files and this entry is wrong.",
      "why": "REASON REWRITTEN 2026-09-11 and the divergence is GONE with it. Until bw-board 5afadcd, i8086-machine.js imported CycleEstimator at MODULE SCOPE, so vendoring that file meant shipping 974,864 bytes of generated cycle table in the editor bundle for a path that is opt-in, defaults to null and that nothing enables. Lite could not pay it, so it removed the whole path across ten sites -- and i8086-machine.js became unvendorable. The estimator is now INJECTED, so lite takes that file BYTE-IDENTICAL and simply does not pass an estimator. These two files stay absent because lite does not use the feature, not because lite amputated it.",
      "sinceUpstream": "5afadcd"
    },
    "i8088-timing.js": {
      "falsifiable": "Lite passes {CycleEstimator} to enableI8088CycleTiming somewhere, at which point it needs both files and this entry is wrong.",
      "why": "REASON REWRITTEN 2026-09-11 and the divergence is GONE with it. Until bw-board 5afadcd, i8086-machine.js imported CycleEstimator at MODULE SCOPE, so vendoring that file meant shipping 974,864 bytes of generated cycle table in the editor bundle for a path that is opt-in, defaults to null and that nothing enables. Lite could not pay it, so it removed the whole path across ten sites -- and i8086-machine.js became unvendorable. The estimator is now INJECTED, so lite takes that file BYTE-IDENTICAL and simply does not pass an estimator. These two files stay absent because lite does not use the feature, not because lite amputated it.",
      "sinceUpstream": "5afadcd"
    }
  }
}
```

---

# What this gate does NOT cover

Written 2026-09-05, after building it, because every section above describes
what the gate catches and a reader would reasonably take the remainder as
covered. **The gate reports on what it found. This is what it did not look
for.** Measured, not guessed — the numbers below come from the same scan the
test runs.

## 1. Three files exist only here, with no upstream counterpart at all

    machine-checkpoint.js          67 lines
    instruction-debug-events.js   114 lines
    target-kinds.js                82 lines

263 lines. These are the shared helpers the covered files import — the
checkpoint envelope, the topology validator, the debug event shapes. **No
comparison is possible**, so neither the identifier coverage nor the
line-level inventory says anything about them.

The exposure is lower than it looks: `sync:bwboard` builds its file list from
the *upstream* tree, so a file with no upstream counterpart is never written
and never deleted. They are unmanaged rather than at risk. But "unmanaged"
and "safe" are different words, and only the first one is verified.

## 2. Two upstream files are not vendored here

`i8088-cycles.js` and `i8088-timing.js` exist in bw-board and not in lite.
Nothing in lite imports them, so nothing is broken — the sync offers to add
them on every run, and **I have deleted them from the working tree on every
run today while testing the guard.** That is a decision I made repeatedly
without recording it, which is exactly the kind of thing this document
exists to stop. Recorded now. Whether to vendor them is open.

(`pin-functions.js` is a third upstream-only file and is deliberately not
vendored: it is node-only, reading the `bw-parts` sibling checkout at
runtime. `index.js` says so at line 70. That one is a decision already
written down, which is the difference.)

## 3. The comparison is line-based and text-based

A reformat, a rename, or moving a function between files reads as deletion.
That direction is safe — it fails toward refusing — but it means a legitimate
upstream refactor will need `--force` and a human. The gate cannot tell a
refactor from a deletion, and does not claim to.

## 4. Only the first vendored root is scanned for divergence

`overlay/` is scanned; `packages/` is checked only for *drift against
overlay*. If both were edited identically and wrongly, the pair test passes
and the divergence scan sees one copy. Two copies agreeing is not two
independent measurements.

## 5. Nothing here checks that the vendored code WORKS

Every assertion in `vendor-identity.test.mjs` is about text. It can tell you
`captureCheckpoint` is still present and named; it cannot tell you it still
saves anything. The behavioural gates are elsewhere, and this file is not a
substitute for them — a point worth making because a green identity gate
feels like more assurance than it is.

## `absentByDesign`: a file lite deliberately does not have

The three kinds above -- `liteOnly`, `graftedFromUpstream`, `liteRemoved` -- all
describe a file that EXISTS in lite, and all match on line content. That is why
none of them saw `i8088-cycles.js`.

On 2026-09-07, syncing the pin for a licence-string change, an unscoped run
refused six files by name and then **created two more that lite had deliberately
removed**. No guard fired, and none could have: with no local copy there are no
lines to compare, so a line-level rule has nothing to match. The absence was the
decision, and the allow-list had no way to say so.

An `absentByDesign` entry is a claim about a FILE rather than about lines in one.
The sync consults it where it would create a file that is not there, and refuses
by name with the reason -- the same shape as the other kinds, one level up.
`--force` does not lift it: a force overwrites work you have decided to lose, and
here there is nothing to lose, because creating the file IS the mistake.

**The rule this leaves, worth stating because it is otherwise nowhere: scoped by
default, unscoped only to look, never to commit unread.** An unscoped sync is the
right tool for seeing what the whole vendor set would do. It is not the tool for a
pin bump, and the two writes above were caught only because someone read the run's
output before committing it -- which is not a mechanism.
