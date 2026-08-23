# Wave 5 technical review — "Debug with evidence"

Reviewed 2026-08-23 against `a3f30be6b`. Ten lessons, twenty checkpoints.

**3 defective of 10 · 3 revised to content version 2 · 3 defects open, all in
the debugger UI rather than in a lesson or a bench.**

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
| debug-task-scheduling | nano03-two-tasks | 1→**2** | **defect** — three of the four fields it asks for are not displayed |
| debug-pins-signals | avr05-button-led | 1 | achievable |
| debug-serial-trace | avr04-serial-pot | 1 | achievable |
| debug-timing-bugs | arduino-02-blink-without-delay | 1 | achievable |
| debug-simulation-hardware | pico02-pot-print | 1 | achievable (`optional-hardware`) |

## The defects

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

**Fixed** in copy, EN and DE: the checkpoint now asks for the state, has the
learner derive runnable/waiting from states plus program time, and says plainly
that the name column is blank and the deadline unprinted — take the names from
your own program. The two UI faults are open and pinned.

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

## Reproducing

```
node --test test/lesson-debugger-surface.test.mjs
```

Three of its six tests are named `OPEN DEFECT`. They fail the day the panel binds
the task name correctly, renders the deadline, or grows a frames view — each
message naming this document and the lesson hint to update.
