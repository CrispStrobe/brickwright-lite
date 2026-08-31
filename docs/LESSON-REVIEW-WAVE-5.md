# Wave 5 technical review — "Debug with evidence"

Reviewed 2026-08-23 against `a3f30be6b`. Ten lessons, twenty checkpoints.

**3 defective of 10 · 3 revised to content version 2 · the four debugger
defects found by this review are closed.** The last closure, on 2026-08-31,
removed the network requirement from supported 8051 debug builds.

Wave 5 is the first wave whose observable is not a circuit. Every other wave asks
whether a bench can produce a reading, and `scripts/lesson-bench.mjs` answers by
solving it. Here the checkpoints ask whether the **debugger** can show
something — a call stack, a task's deadline, a watch, a conditional halt — so the
subject under test is the debug surface, and `test/lesson-debugger-surface.test.mjs`
checks it the same way: against what the code produces and renders, not against
what the feature is called.

All ten benches exist, ship both a circuit and a program, and carry the parts
their lessons need — the three lessons that turn on a press (`26-debounce`,
`05-counter`, `avr05-button-led`) all have a button. The Tier-3 detector reported
nothing, as expected: none of these three defects is a demand for a missing
bench capability.

## Verdicts

| lesson | example | v | verdict |
| --- | --- | --- | --- |
| debug-reproduce-minimize | 26-debounce | 1 | achievable |
| debug-pause-step | 01-blink | 1 | achievable |
| debug-watches | 05-counter | 1→**2** | **defect** — the watch surface it implies is gated off on this target |
| debug-conditional-breakpoints | 05-counter | 1 | achievable, and unusually well matched to the tool |
| debug-call-stack | 13-sos-morse | 1→**2** | **defect** — no frames or locals view exists |
| debug-task-scheduling | nano03-two-tasks | 1→**2** | defect FIXED 2026-08-23 — panel binds `task.task` and prints `until` (bw-circuit-ui be95ab2, vendored 90161eb5) |
| debug-pins-signals | avr05-button-led | 1 | achievable |
| debug-serial-trace | avr04-serial-pot | 1 | achievable |
| debug-timing-bugs | arduino-02-blink-without-delay | 1 | achievable |
| debug-simulation-hardware | pico02-pot-print | 1 | achievable (`optional-hardware`) |

## The defects

### 0. The debugger could not start offline — closed 2026-08-31 for supported 8051 targets

Found last, while reviewing Wave 3, and it should have been found first. My whole
first pass asked what the debugger can **show**; none of it asked whether the
debugger can **start**.

`debug-runner.js` now routes supported 8051 builds through four browser-local
WASM stages:

```
project  --generateC({debug:true})-->  C + @bw yield map
         --cc1→sdcc→sdas→sdld WASM--> .hex + symbol table
         --emu8051 + bw-board------->  a running, breakable program
```

The local route is the default for the five targets whose headers and small-model
libraries are bundled. A local failure stays local and visible; it never silently
falls back to the network. AVR, RP2040, 6502 and other unsupported families retain
an explicit hosted route. The first real generated program also forced the
toolchain past two defects the hand-written fixtures missed: SDCC's recursive AST
walk overflowed Emscripten's 64 KiB default stack, and instruction-less `case 0`
labels were absent from the debug line map. The accepted build uses an 8 MiB
checked stack and generated scheduler programs now produce complete symbols.
The production gate aborts any external compiler POST
and proves the counter lesson can build, run, pause, expose its linked `count`
variable and scheduler frames, step one cycle, and halt on a write watchpoint.

### 1. The task list shows one of the four fields the lesson asks for

`debug-task-scheduling`'s hint tells the learner to "Record task name, state,
wait deadline, and runnable/waiting status". Two separate faults reduce that to
one field.

**The name column is bound to a key nothing emits.** All three debug targets
build their task record identically:

```js
const entry = { task: name, state };          // avr8js-debug, emu8051-debug, rp2040js-debug
if (state !== 0xFFFF) { … entry.until = until; }
```

The key is `task`. `DebugStatus.jsx:131` renders `{task.name}`. Nothing between
them remaps it, so the name column is `undefined` for every task on every
target. The rest of the debug layer agrees with the producers — `t.task`,
`y.task` throughout `debug-runner.js` — so the panel is the odd one out.

**The deadline is produced and never rendered.** Every target sets
`entry.until`, and `debug-runner.js`'s `stillWaiting()` consumes it with a
16-bit wraparound-safe compare. The panel renders `task.name`, `task.state` and
`task.label` — and `label` is emitted by no target either, so that span never
appears. `until` is nowhere in the panel.

Worth noting what is *right* here, because it shows the omission is an oversight
rather than a decision: `emu8051-debug.js` deliberately withholds `until` for a
finished task, with the reason given in the source — "a task that has finished is
not waiting for anything — reporting `until` there would invite a front end to
render a deadline that means nothing". Somebody thought carefully about when the
deadline is meaningful. The front end then never rendered it at all.

**RESOLVED 2026-08-23.** bw-circuit-ui fixed the panel upstream (be95ab2:
binds `{task.task}`, renders `until`, drops the never-emitted `label`), and the
fix reached lite with the 90161eb5 vendor. The holding-pattern tests went red on
that vendor exactly as designed and were deleted in the same commit; the
checkpoint hint (EN and DE) was re-measured and now tells the learner to read
name, state, and deadline straight from the panel.

### 2. There is no call stack to inspect

`debug-call-stack`'s `inspect` checkpoint said "Halt inside the procedure,
**inspect frames and locals**, step out, and confirm the caller resumes once."

`Step Out` is real — it is in the panel and in `debug-runner.js`. A frames or
locals view is not. Searching the whole debug UI for a stack display finds
`stepOut` and `stepOver` controls, breakpoints, tasks, watchpoint fields, halt
reason, program time — and nothing that lists frames. The only matches for
"frames" in the repository outside this lesson's own JSON are a comment about
video frames and a comment in the runner.

The lesson half-knew: its first checkpoint says "write message → letter → symbol
→ pulse **if those frames exist at the selected debug level**", and its hint said
"compare the displayed stack with the selected debugger granularity". But
hedging in the prediction step does not make the action step possible.

**Fixed**, version 2: the action is now "use Step Out and confirm the caller
resumes exactly once", and the hint says there is no frames-and-locals panel, so
reconstruct the stack from where each Step Out lands. That is a harder exercise
and an honest one — the learner's prediction from the previous checkpoint becomes
the thing under test, which is what the lesson wanted anyway.

**Version 3, 2026-08-29 — the pane now exists, and what it shows is a
refusal.** D28 is closed, and not by adding the list this lesson originally
asked for. There IS no call stack on the C target: the program is a cooperative
scheduler, so each WHEN block is a state machine over a millisecond tick and
"inside the pulse procedure" is a value in a `<task>_state` variable. The
Position pane says exactly that, in words, above the data — and then shows what
does exist: every task, its state, its deadline, the symbol-table ADDRESS the
state lives at, and the block it belongs to. On a 6502 or Z80 bench the same
pane walks a real return-address stack, still labelled as candidates because
nothing on those machines distinguishes a return address from a pushed
register.

So v2's exercise survives intact — reconstruct the nesting from where Step Out
lands — and the hint now points at the pane that tells the learner WHY they
have to. The sentinel that held this open fired on its own terms and was
retired; what stands in its place asserts the refusal, not the pane's
existence, because a pane that invented a call stack here would satisfy the old
test and fail the lesson.

### 3. The watch surface is gated off on this lesson's target

`debug-watches` asks the learner to "Choose a minimal watch set" and "annotate the
first trace row where each watch changes".

Write watchpoints are feature-detected. `emu8051-debug.js`:

```js
const hasWatchpoints = typeof wasm._emu_dbg_set_bp_write === 'function';
return { steps: […], breakpoints: hasWatchpoints ? ['code','yield','write'] : ['code','yield'], … };
```

and `DebugStatus.jsx` shows the watchpoint field only when `breakpoints`
includes `'write'`. The module's own documentation says which builds have it:
"Upstream builds now export `emu_dbg_set_bp_write`; **older builds (the pinned one
in brickwright-lite) do not**." `05-counter` is `DEVICE STC12C5A60S2`, so it runs
on exactly that target.

There *is* a working value surface: `bw-debug/hover-values.js` publishes a
per-block resolver so the editor can show a value on hover while paused. And
trace rows do not carry variable values — `trace.js` has no vars field — so
"annotate the first trace row where each watch changes" means hovering at each
step rather than reading a watch list.

**Fixed**, version 2: the hint now says to read values by hovering blocks while
paused, and that a write-watchpoint field appears only for targets whose build
supports one — which this board's does not.

**What I could not check here**, and it is the one claim in this document that is
not first-hand: whether lite's *actual* pinned WASM exports
`_emu_dbg_set_bp_write`. Instantiating it needs the emu8051 build and a compiled
firmware, both env-gated. So the mechanism is measured and the build is taken
from the module's own docs. If the pinned build does export it, the watchpoint
field appears and this lesson needs its hint softened again.

**CHECKED 2026-08-29, and it did.** The one unverified claim in this document
was the one that was wrong. Instantiating the vendored artifact —
`overlay/scratch-gui/src/lib/emu8051/emu8051.js`, the binary this app actually
ships — shows `_emu_dbg_set_bp_write` present, and present in every build back
through the pin this document was written against. The comment in
`emu8051-debug.js` that said otherwise was the source for this section, for
D29's ledger row, for a test comment and for the hint below; none of the four
had asked the binary. That is the lesson of this paragraph and it is worth
keeping: a claim marked "not first-hand" was the only false one in a document
of forty.

What was genuinely missing was the other half — the halt could not report WHICH
address changed or to what, because `struct dbg_halt_reason` carried no such
fields and reached JS only as a pointer. And lite never handed
`onAddWatchpoint` to the panel that gates on it, so the field could not have
appeared even with the export present. Both are fixed; the emulator now reports
space, address, value and previous value, and the halt line names them.

**Version 3**: the hint says the watchpoint field IS available here and how to
reach it, and states the limit that actually matters — it reports a CHANGE, not
every write, so a watch that never fires may mean the write happened and
changed nothing.

## The seven that hold up

- **debug-conditional-breakpoints** is the best-matched lesson in the wave, and
  it is worth saying so. Its hint names "the app's simple comparison syntax, such
  as `counter = 5`" — and `bw-debug/condition.js` parses exactly that grammar,
  deliberately without arithmetic or `eval`, because "a condition is a comparison
  between a variable and a number; nothing about it needs a programming
  language". Measured: `counter = 5` parses and tests true at 5, false at 4;
  `counter * 2 > 5` is refused with a reason rather than silently defaulting.
  And the checkpoint's odd-sounding instruction to "deliberately test a
  misspelled variable" lands perfectly: `countr = 5` **parses** (it is a legal
  name) and then evaluates false for ever, which is precisely the
  looks-like-a-broken-breakpoint experience the learner is meant to diagnose.
- **debug-reproduce-minimize**, **debug-pause-step**, **debug-pins-signals**,
  **debug-serial-trace** rest on pause, single step, pin traces and serial
  capture, all of which the panel and the targets provide; the benches carry the
  buttons and pots their checkpoints press and turn.
- **debug-timing-bugs** needs timestamped traces and scope cursors, both present.
  Its bench, `arduino-02-blink-without-delay`, ships a `btn1` that no program
  reads — flagged by bw-cui2's declared-pins gate — but **the lesson never
  mentions a button**: its two checkpoints are entirely about edge times, period
  error and jitter. So the decorative control is a corpus question, not a lesson
  one, and it does not affect this verdict.
- **debug-simulation-hardware** is the wave's only `optional-hardware` lesson and
  the only one observing `hardware-state`. Its `compare` checkpoint explicitly
  offers a fallback — "otherwise use a documented hypothetical deviation" — so it
  is achievable without a board, which is what makes the observable legitimate
  rather than dead.

## What I could not check

- **No live debug session.** `emu8051` needs its WASM and a compiled firmware,
  both env-gated, so these findings are contract-level — the producer emits X,
  the consumer reads Y — rather than "I watched the panel". For the two UI faults
  that is decisive: a key mismatch and an absent component do not need a running
  session. For the watchpoint build it is not, and that is flagged above.
- **The German copy**, revised alongside the English but not reviewed.
- **Pedagogy** — in particular whether a wave about debugging should be taught on
  a debugger this young. Three of its ten lessons describe a richer tool than the
  one that exists.
- **Hosted-family outage behaviour.** The offline gate deliberately covers the
  supported 8051 path. Unsupported families still name and use their hosted
  compiler route, so outage UX for those families remains a separate field test.

## Reproducing

```
node --test test/lesson-debugger-surface.test.mjs
```

The old hosted-compiler `OPEN DEFECT` sentinel is retired. Its replacement pins
the five local target names, the explicit hosted-family route, and the rule that
a supported-target local failure cannot escape to the network. The production
browser proof is `node scripts/verify-debug-frames-watch.mjs`.

The watchpoint test is still here but its wording is corrected: it pins the
MECHANISM (feature detection, and the panel gating on the capability) plus the
consumer wiring that was the real gap. The claim about the BUILD moved to
`test/debug-watchpoint-cycle.test.mjs`, which loads the vendored WASM and asks
it rather than reading a comment about it. That relocation is the fix for how
this section went wrong.
