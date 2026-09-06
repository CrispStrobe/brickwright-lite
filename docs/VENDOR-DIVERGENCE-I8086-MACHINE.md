# `bw-board/i8086-machine.js` has diverged BOTH WAYS

Discovered 2026-09-04 while trying to vendor the NE2000 into lite.

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
    "i8086-machine.js": {
      "liteOnly": [
        {
          "id": "display-revision-token",
          "falsifiable": "The screen redraws on every frame even when nothing on it changed, so the fan spins up on a program that is just sitting at a prompt.",
          "why": "Host-renderer optimisation: a monotonic token bumped on visible VRAM and CRTC writes so the renderer can skip repaints. Never upstreamed. A sync deletes it and NOTHING FAILS -- the machine constructs, the screen just repaints every frame until someone profiles.",
          "contains": "this\\.displayRevision = 0;"
        },
        {
          "id": "display-revision-bump-vram",
          "falsifiable": "Same as above: the picture is right, the machine is just working far harder than it needs to.",
          "why": "The bump must stay GOVERNED by the VRAM address test. Hoisting it out bumps on every write and destroys the optimisation while still reading as present.",
          "contains": "if \\(addr >= 0xa0000 && addr <= 0xbffff\\) \\{?[^}]*?this\\.displayRevision = \\(this\\.displayRevision \\+ 1\\)"
        },
        {
          "id": "display-revision-bump-crtc",
          "falsifiable": "Switching video modes does not refresh the screen, or refreshes it constantly.",
          "why": "Same, governed by the CRTC port range.",
          "contains": "if \\(port >= 0x3b0 && port <= 0x3df\\) \\{?[^}]*?this\\.displayRevision = \\(this\\.displayRevision \\+ 1\\)"
        },
        {
          "id": "display-revision-bump-block",
          "falsifiable": "Loading an image into video memory does not make it appear until something else happens to trigger a repaint.",
          "why": "Same, governed by the block-write overlap test.",
          "contains": "if \\(base <= 0xbffff && base \\+ bytes\\.length > 0xa0000\\) \\{?[^}]*?this\\.displayRevision = \\(this\\.displayRevision \\+ 1\\)"
        },
        {
          "id": "on-instruction-hook",
          "falsifiable": "The debugger will not single-step: you press Step and nothing moves.",
          "why": "Per-instruction hook carrying pcBefore/pcAfter and the cycle delta. The debugger's single-step and the trace view are both built on it.",
          "contains": "if \\(this\\.hooks\\.onInstruction\\) \\{?[^}]*?pcBefore"
        },
        {
          "id": "checkpoint-topology-snapshot",
          "falsifiable": "You save a program on one board, load it on a board wired differently, and it runs as nonsense instead of refusing.",
          "why": "A checkpoint restored into a DIFFERENT machine topology is silent corruption -- same registers, different wiring. The snapshot makes restore refuse rather than half-work.",
          "contains": "_snapshotTopology\\(\\)"
        },
        {
          "id": "checkpoint-refuses-incomplete-state",
          "falsifiable": "You save, reload, and the machine comes back subtly wrong -- a sound still playing, a chip mid-transfer -- instead of telling you it could not save.",
          "why": "canCheckpoint() refuses rather than saving a machine whose components lack a complete state API. THIS IS THE ABSENT-HARDWARE RULE APPLIED TO SAVE STATE: a partial checkpoint restores to a plausible-looking wrong machine, which is worse than no checkpoint.",
          "contains": "canCheckpoint\\(\\)"
        },
        {
          "id": "checkpoint-component-state-api",
          "falsifiable": "A saved file changes by itself after you save it, because it shares memory with the running machine.",
          "why": "getState/saveState dual-API bridge with deep clone, so a checkpoint does not alias live device buffers.",
          "contains": "static _cloneCheckpointValue\\(value\\)"
        },
        {
          "id": "checkpoint-component-bridge",
          "falsifiable": "Saving works on one board and produces a file that will not load on the same board, with no explanation of which part failed.",
          "why": "_saveComponent and _loadComponent name the failing component in the error ('component X has no state API', 'X state API is incompatible') rather than throwing from inside a generic loop. ADDED 2026-09-05 BECAUSE THE DERIVED COVERAGE CHECK FOUND THEM UNEXPLAINED -- the pinned >=8 floor had never noticed, because 8 entries is 8 entries whatever they cover.",
          "contains": "static _saveComponent\\(name, component\\)"
        }
      ],
      "graftedFromUpstream": [
        {
          "id": "ne2000-chip-kind",
          "contains": "ne2000"
        },
        {
          "id": "port-conflict-check",
          "contains": "both claim"
        }
      ],
      "liteRemoved": [
        {
          "id": "cycle-estimator-not-vendored",
          "absent": "CycleEstimator|i8088-timing",
          "falsifiable": "The 8086 stops working completely \u2014 no machine, no screen, no blocks \u2014 because the file it now says it imports is not in this repository at all.",
          "why": "THIS ENTRY POINTS THE OTHER WAY FROM THE NINE ABOVE. Upstream HAS this and lite deliberately does not, so there is no lite-only text for `contains` to hold; `absent` must NOT match the vendored copy. bw-board's i8086-machine.js imports CycleEstimator from ./i8088-timing.js at line 44 and uses _cycleEst nine times (9256cf7, opt-in cycle-accurate timing, ~6x). That import is present at MASTER AND AT THE CURRENT PIN, so lite did not fall behind on it \u2014 lite REMOVED it, before this allow-list existed to record the decision. Found 2026-09-06 while measuring vendor direction, having been written down nowhere for the whole time the nine entries above were being maintained. Re-adding the import means vendoring i8088-timing.js AND i8088-cycles.js, which it imports TABLES and PROVENANCE from: 983 KB of new bundle, 975 KB of it one table file, for a mode lite does not expose. That is a decision with its own owner and its own row, not something a pin move carries in silently."
        }
      ]
    },
    "z80-machine.js": {
      "liteOnly": [
        {
          "id": "z80-checkpoint-capture",
          "falsifiable": "You cannot save and reload a running program: the save does nothing, or produces a file that will not load on the same board.",
          "why": "captureCheckpoint/restoreCheckpoint: the save and load path itself. Forward-ported here and never upstreamed.",
          "contains": "captureCheckpoint\\(\\)"
        },
        {
          "id": "z80-checkpoint-restore",
          "falsifiable": "You cannot save and reload a running program: the save does nothing, or produces a file that will not load on the same board.",
          "why": "The load half. Validates the envelope before touching machine state, so a bad file is refused rather than half-applied.",
          "contains": "restoreCheckpoint\\("
        },
        {
          "id": "z80-checkpoint-support",
          "falsifiable": "The machine saves a file that silently comes back wrong -- a sound still playing, a chip mid-transfer -- instead of telling you it could not save.",
          "why": "checkpointSupport() collects REASONS a save cannot be trusted (host PC traps owning state outside the machine) and refuses rather than saving something that reloads wrong.",
          "contains": "checkpointSupport\\(\\)"
        },
        {
          "id": "z80-checkpoint-topology",
          "falsifiable": "A saved file loads into a differently-wired board and runs as nonsense instead of refusing.",
          "why": "checkpointTopology() stamps the wiring into the file so a restore into a different board is refused, not silently misapplied.",
          "contains": "checkpointTopology\\(\\)"
        }
      ]
    },
    "m6502-machine.js": {
      "liteOnly": [
        {
          "id": "m6502-checkpoint-capture",
          "falsifiable": "You cannot save and reload a running program: the save does nothing, or produces a file that will not load on the same board.",
          "why": "captureCheckpoint/restoreCheckpoint: the save and load path itself. Forward-ported here and never upstreamed.",
          "contains": "captureCheckpoint\\(\\)"
        },
        {
          "id": "m6502-checkpoint-restore",
          "falsifiable": "You cannot save and reload a running program: the save does nothing, or produces a file that will not load on the same board.",
          "why": "The load half. Validates the envelope before touching machine state, so a bad file is refused rather than half-applied.",
          "contains": "restoreCheckpoint\\("
        },
        {
          "id": "m6502-checkpoint-support",
          "falsifiable": "The machine saves a file that silently comes back wrong -- a sound still playing, a chip mid-transfer -- instead of telling you it could not save.",
          "why": "checkpointSupport() collects REASONS a save cannot be trusted (host PC traps owning state outside the machine) and refuses rather than saving something that reloads wrong.",
          "contains": "checkpointSupport\\(\\)"
        },
        {
          "id": "m6502-checkpoint-topology",
          "falsifiable": "A saved file loads into a differently-wired board and runs as nonsense instead of refusing.",
          "why": "checkpointTopology() stamps the wiring into the file so a restore into a different board is refused, not silently misapplied.",
          "contains": "checkpointTopology\\(\\)"
        },
        {
          "id": "m6502-external-nmi-pin",
          "falsifiable": "Pulsing the 6502's NMI pin from outside the CPU does nothing, or the machine's peripherals fall behind the processor by the interrupt's bus time so a timer fires late.",
          "why": "nmi() pulses NMI as an EXTERNAL PIN EVENT and then advances the peripherals through the 7 cycles it costs. Upstream calls this.cpu.nmi() internally from the VGA path but declares no such entry point, so a host driving the pin has nothing to call. NAMED 2026-09-05 after a rebase moved what 'upstream' means and the derived-coverage check found it unexplained -- the third time a pin bump has surfaced an identifier that was lite-only all along.",
          "contains": "nmi\\(\\) \\{"
        }
      ]
    },
    "z80-debug.js": {
      "liteOnly": [
        {
          "id": "z80-debug-replay-input",
          "falsifiable": "A recorded session plays back with no input -- the buttons you pressed during recording do nothing on replay.",
          "why": "applyReplayInput routes a recorded producer event back into the machine; without it a replay runs with the program but none of the input.",
          "contains": "applyReplayInput\\("
        },
        {
          "id": "z80-debug-input-listener",
          "falsifiable": "A recorded session plays back with no input -- the buttons you pressed during recording do nothing on replay.",
          "why": "onDebugInput registers the listener the recorder subscribes to. No listener, nothing recorded to replay.",
          "contains": "onDebugInput\\("
        },
        {
          "id": "z80-debug-checkpoint-bridge",
          "falsifiable": "You cannot save and reload a running program: the save does nothing, or produces a file that will not load on the same board.",
          "why": "The debug target forwards captureCheckpoint and restoreCheckpoint to the machine; without it the debugger cannot save or reload at all.",
          "contains": "captureCheckpoint"
        },
        {
          "id": "z80-debug-timestamped-facts",
          "falsifiable": "A recorded session plays back in the wrong order, or a saved checkpoint cannot be placed on the timeline against the events around it.",
          "why": "debugTime() stamps every producer fact and every checkpoint from one clock, so replay ordering and checkpoint placement agree. Without it the facts still record and still replay -- just not necessarily in the order they happened, which is the kind of wrong that looks right until a bug depends on ordering. NAMED 2026-09-05 because the pin bump moved upstream and the derived-coverage check found it unexplained.",
          "contains": "debugEvents\\.debugTime\\(\\)"
        },
        {
          "id": "z80-debug-replay-instruction",
          "falsifiable": "Stepping backwards one instruction silently does nothing, instead of saying why it cannot -- for example that a halted Z80 has no instruction to retire without a recorded interrupt.",
          "why": "replayInstruction() checks checkpointSupport() and the halted state FIRST and returns a coded refusal ('unsupported-replay', 'halted-without-instruction') with the reason. The refusal is the feature: an unsupported reverse-step that returns nothing is indistinguishable from one that worked and changed nothing.",
          "contains": "replayInstruction\\(\\)"
        }
      ]
    },
    "m6502-debug.js": {
      "liteOnly": [
        {
          "id": "m6502-debug-replay-input",
          "falsifiable": "A recorded session plays back with no input -- the buttons you pressed during recording do nothing on replay.",
          "why": "applyReplayInput routes a recorded producer event back into the machine; without it a replay runs with the program but none of the input.",
          "contains": "applyReplayInput\\("
        },
        {
          "id": "m6502-debug-input-listener",
          "falsifiable": "A recorded session plays back with no input -- the buttons you pressed during recording do nothing on replay.",
          "why": "onDebugInput registers the listener the recorder subscribes to. No listener, nothing recorded to replay.",
          "contains": "onDebugInput\\("
        },
        {
          "id": "m6502-debug-checkpoint-bridge",
          "falsifiable": "You cannot save and reload a running program: the save does nothing, or produces a file that will not load on the same board.",
          "why": "Same bridge on the 6502 target: captureCheckpoint and restoreCheckpoint forwarded to the machine.",
          "contains": "captureCheckpoint"
        },
        {
          "id": "m6502-debug-timestamped-facts",
          "falsifiable": "A recorded session plays back in the wrong order, or a saved checkpoint cannot be placed on the timeline against the events around it.",
          "why": "debugTime() stamps every producer fact and every checkpoint from one clock, so replay ordering and checkpoint placement agree. The same mechanism as the Z80 target -- named here separately because the gate is per-file and a shared explanation would let one of them be deleted while the other stayed green.",
          "contains": "debugEvents\\.debugTime\\(\\)"
        },
        {
          "id": "m6502-debug-replay-instruction",
          "falsifiable": "Stepping backwards one instruction silently does nothing instead of saying why it cannot.",
          "why": "replayInstruction() checks checkpointSupport() first and returns a CODED refusal with a reason. The refusal is the feature: an unsupported reverse-step that returns nothing is indistinguishable from one that worked and changed nothing.",
          "contains": "replayInstruction\\(\\)"
        },
        {
          "id": "m6502-debug-nmi-is-recorded",
          "falsifiable": "A recorded session that used the NMI button replays without it -- the interrupt happens live and is missing on playback, so the run diverges at that point and nowhere before it.",
          "why": "nmi() calls publishInput('m6502.nmi') FIRST and refuses if the recorder rejects it, so the interrupt cannot happen without being recorded. Dropping the publish leaves a working button and an unreplayable recording, which is the failure that looks like a working feature.",
          "contains": "publishInput\\('m6502\\.nmi'"
        },
        {
          "id": "m6502-debug-replay-boundary",
          "falsifiable": "Reverse-stepping to a recorded input lands somewhere else, or accepts a malformed boundary and runs to an arbitrary point instead of saying the boundary was invalid.",
          "why": "replayToInputBoundary() parses the boundary as a BigInt inside a try and returns a CODED refusal ('invalid-input-boundary') rather than throwing or coercing. A NaN tick count that is silently accepted replays to the wrong place and reports success.",
          "contains": "replayToInputBoundary\\(boundary\\)"
        }
      ]
    },
    "emu8051-adapter.js": {
      "liteOnly": [
        {
          "id": "emu8051-replay-input",
          "falsifiable": "A recorded session plays back with no input -- the buttons you pressed during recording do nothing on replay.",
          "why": "applyReplayInput on the 8051 adapter.",
          "contains": "applyReplayInput\\("
        },
        {
          "id": "emu8051-input-listener",
          "falsifiable": "A recorded session plays back with no input -- the buttons you pressed during recording do nothing on replay.",
          "why": "onInput registers the recorder listener on the 8051 adapter.",
          "contains": "onInput\\("
        }
      ]
    }
  },
  "lineLevelOnly": {
    "why": "These files carry forward-ported work that adds no NEW declared identifier -- changed method bodies, extra branches, comments -- so the identifier-based coverage above cannot see them. 458 lines as of 2026-09-05. They are protected by the sync's content-derived guard, but that only runs when someone runs the sync; this inventory is what makes the test suite see them too. Recorded as a SET, not counts, so ordinary edits do not churn it. UPDATED 2026-09-05 (later): six files joined the set -- avr8js-debug, i8259, rp2040-bootrom, rp2040js-debug, w65c51, zx-ula. THE SET DOES NOT DISTINGUISH AHEAD FROM BEHIND, and these show both. Measured lite-only vs upstream-only lines: i8259 32/156 and rp2040-bootrom 56/91 are lite being BEHIND (the 8259 rotation work landed in bw-board this afternoon and the vendor is held pending a readable CI verdict); zx-ula 19/3 and avr8js-debug 5/1 look forward-ported. The ratio is a SIGNAL, not proof -- sync-bw-board.mjs says plainly that a content comparison cannot tell direction, and that is still true. What the ratio does is tell you which way to look first. Re-derive after the vendor lands. UPDATED 2026-09-05 (pin bump to 0a779af). FOUR FILES LEFT THE SET -- i8086, i8259, ne2000, rp2040-bootrom -- because the bump synced them and they now match upstream; the gate reported them as GONE, which is the direction an inventory that could only fail one way would have missed entirely. ONE JOINED: z80-adapter.js, one lite-only line, undocumented until the gate named it. Both directions fired on the same run, against the branch that caused them.",
    "files": [
      "avr8js-debug.js",
      "cortex-m0-machine.js",
      "debug-session.js",
      "debug-target-factory.js",
      "emu8051-debug.js",
      "i8086-adapter.js",
      "i8086-debug.js",
      "index.js",
      "m6502-adapter.js",
      "reseat-gate.js",
      "rp2040js-debug.js",
      "w65c51.js",
      "z80-adapter.js",
      "zx-ula.js"
    ]
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
