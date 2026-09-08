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
          "falsifiable": "The 8086 stops working completely — no machine, no screen, no blocks — because the file it now says it imports is not in this repository at all.",
          "why": "THIS ENTRY POINTS THE OTHER WAY FROM THE NINE ABOVE. Upstream HAS this and lite deliberately does not, so there is no lite-only text for `contains` to hold; `absent` must NOT match the vendored copy. bw-board's i8086-machine.js imports CycleEstimator from ./i8088-timing.js at line 44 and uses _cycleEst nine times (9256cf7, opt-in cycle-accurate timing, ~6x). That import is present at MASTER AND AT THE CURRENT PIN, so lite did not fall behind on it — lite REMOVED it, before this allow-list existed to record the decision. Found 2026-09-06 while measuring vendor direction, having been written down nowhere for the whole time the nine entries above were being maintained. Re-adding the import means vendoring i8088-timing.js AND i8088-cycles.js, which it imports TABLES and PROVENANCE from: 983 KB of new bundle, 975 KB of it one table file, for a mode lite does not expose. That is a decision with its own owner and its own row, not something a pin move carries in silently."
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
        },
        {
          "id": "z80-debug-event-retire-boundary",
          "falsifiable": "A port or memory event halts the Z80 in the middle of its instruction, before the architectural PC and memory state reach a replayable boundary.",
          "why": "The target explicitly advertises the observed instruction-retire boundary which its instruction-atomic producer publishes after ordered access facts. Runner admission depends on this claim instead of a Z80 name check.",
          "contains": "eventBreakpointBoundary: 'instruction-retire'"
        },
        {
          "id": "z80-debug-memory-event-space",
          "falsifiable": "The Z80 publishes memory events which the breakpoint compiler refuses because the target declares no matching address space.",
          "why": "The mem capability connects the already-published memory facts and passive debugger read surface to the target-neutral event predicate engine.",
          "contains": "spaces: \\{mem: \\{read: true, write: true, passiveRead: true\\}\\}"
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
        },
        {
          "id": "m6502-debug-event-retire-boundary",
          "falsifiable": "A RAM or memory-mapped device event halts the 6502 in the middle of its instruction, before the architectural PC and device state reach a replayable boundary.",
          "why": "The target explicitly advertises the observed instruction-retire boundary which its instruction-atomic producer publishes after ordered memory access facts. Runner admission depends on this capability instead of a CPU-name exception.",
          "contains": "eventBreakpointBoundary: 'instruction-retire'"
        },
        {
          "id": "m6502-debug-memory-event-space",
          "falsifiable": "The 6502 publishes memory events which the breakpoint compiler refuses, or conditions destructively read a memory-mapped VIA while deciding whether to halt.",
          "why": "The mem capability connects published memory facts to the target-neutral predicate engine while passiveRead false preserves the truth that RAM and MMIO occupy one address space.",
          "contains": "spaces: \\{mem: \\{read: true, write: true, passiveRead: false\\}\\}"
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
      "cortex-m0-machine.js",
      "debug-session.js",
      "debug-target-factory.js",
      "emu8051-debug.js",
      "i8086-adapter.js",
      "i8086-debug.js",
      "index.js",
      "m6502-adapter.js",
      "rp2040js-debug.js",
      "z80-adapter.js",
      "zx-ula.js"
    ],
    "note": "Files that diverge only line-by-line and have no named allow-list entry. Recorded as a SET, not counts. reseat-gate.js left this inventory on 2026-09-07: it was not forward-ported work at all, it was lite BEHIND by one upstream commit (20f0d45), and syncing it forward made it identical. Corrected in VENDOR-DIRECTION-2026-09-06.md -- size has no direction."
  },
  "liteAuthored": {
    "why": "THE MIRROR IMAGE OF absentByDesign BELOW. That list records files upstream has and lite deliberately does not; this one records files LITE has and upstream does not -- lite-authored source living inside a vendored root. Seven as of 2026-09-07, found while measuring a proposed vendored-path gate. They were not invisible: test/vendor-identity.test.mjs has printed them since lego-b9 added the liteOnly and notCompared collectors this morning. But printed is not asserted, and nothing said which of the seven were deliberate. A lite-authored file in a vendored directory is one careless sync from being clobbered and has no upstream to restore it from, so each one is now a decision recorded once rather than an accident nobody has examined. THE REASON MUST SAY WHY IT LIVES HERE RATHER THAN BESIDE LITE'S OWN CODE -- six of the seven are reached by relative import from a vendored sibling that itself carries a declared divergence, which is a real constraint; resolve-netlist.js is not, and its entry says so.",
    "ratchet": "Entries may be REMOVED freely -- a file that moves out or lands upstream should leave. An entry may only be ADDED together with its reason in the same commit, and the gate refuses any lite-authored file that is not listed, so adding the file without the reason cannot go green.",
    "files": {
      "instruction-debug-events.js": {
        "reason": "Imported by m6502-debug.js and z80-debug.js, both of which have NAMED allow-list entries above. Those two are vendored files carrying declared lite-only work, and that work is what imports this module by relative path -- so it lives here because its callers do, and it exists at all because their divergence does.",
        "importedBy": [
          "m6502-debug.js",
          "z80-debug.js"
        ]
      },
      "machine-checkpoint.js": {
        "reason": "Same shape: imported by z80-machine.js and m6502-machine.js, both NAMED entries. The checkpoint schema is the lite-only save/restore work in those two files factored out of them.",
        "importedBy": [
          "z80-machine.js",
          "m6502-machine.js"
        ]
      },
      "w65c02-cycle-provider.js": {
        "reason": "Imported by debug-target-factory.js, a lineLevelOnly entry. Holds the JSMOO W65C02 REJECTION -- a qualification verdict with its candidate and oracle commits. Deliberately a refusal record rather than an engine: it is the evidence for not adopting one, so it belongs beside the factory that would otherwise reach for it.",
        "importedBy": [
          "debug-target-factory.js"
        ]
      },
      "z80-target-factory.js": {
        "reason": "Imported by debug-target-factory.js, a lineLevelOnly entry. Selects fast or cycle Z80 execution, and dynamically imports the cycle path so the optional core is never pulled into the bundle by the fast one.",
        "importedBy": [
          "debug-target-factory.js"
        ]
      },
      "z80-cycle-debug.js": {
        "reason": "Second order: imported by z80-target-factory.js, which is itself lite-authored and here for the reason above. No upstream file references it.",
        "importedBy": [
          "z80-target-factory.js"
        ]
      },
      "floooh-z80-cycle-provider.js": {
        "reason": "Third order: imported only by z80-cycle-debug.js. The optional product boundary for the qualified floooh/chips Z80 engine -- third-party source and WASM deliberately NOT bundled, a caller must supply a loader for a reviewed wrapper. That refusal is the point of the file and is why it is source rather than a dependency.",
        "importedBy": [
          "z80-cycle-debug.js"
        ]
      },
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
      "falsifiable": "The editor bundle grows by roughly 983 KB, 975 KB of it one cycle table, for a timing mode lite does not expose in any UI.",
      "why": "Lite REMOVED the opt-in cycle-accurate timing path (upstream 9256cf7's CycleEstimator) before the allow-list existed to record it -- brickwright-lite-ea's tenth divergence, found by measuring direction per file and in no document until 2026-09-06. Upstream imports it from i8086-machine.js; lite has zero references to any of it. A sync CREATES this file because there is no local copy to compare, so no line-level entry can protect it.",
      "sinceUpstream": "9256cf7"
    },
    "i8088-timing.js": {
      "falsifiable": "Same: the file lite does not have pulls in i8088-cycles.js, so taking either takes both.",
      "why": "The other half of the removed CycleEstimator path. i8088-timing.js is what i8086-machine.js imports; it in turn pulls i8088-cycles.js. Absent by the same decision and for the same reason.",
      "sinceUpstream": "9256cf7"
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
