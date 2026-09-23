# Pseudocode → Verilog: is it the same job as the other targets?

**Status: design note. No decision taken, nothing built.** Written 2026-09-22
so the comparison below does not have to be re-derived.

The question that prompted it: the Code tab already turns pseudocode into
Python, JavaScript, C, BASIC, MicroPython, NQC and 8086 assembly. Could it turn
pseudocode into Verilog, and should Verilog be a subtab there?

The short answer is that **the honest comparison is with the 8086 backend, not
with Python**, and that changes both the cost and the shape.

## How the existing transpilers actually work

The IR is the SB3 project — Scratch blocks. Every backend walks it. But they
come in two shapes, and the difference is the whole story.

**Shape 1 — emit calls into a runtime.** `generateC`, `generateMicroPython`,
`generateBASIC`, `generatePython`, `generateJavaScript`. The emitted program is
mostly `scratch_*` calls plus a `bw_structure()` marker; the semantics live in
a library shipped alongside (`sb3-creator-chostruntime.js`,
`sb3-creator-runtime.js`). The generator decides *shape*; the runtime supplies
*meaning*.

**Shape 2 — lower to a machine.** `bw-asm/pseudocode-8086.js`. No high-level
runtime: the body goes straight-line into `main()`, and `wait` becomes
`INT 15h AH=86h`. Its header is worth reading before writing any new backend,
because it states the house rules:

- *"IT IS NOT A NEW LANGUAGE DESIGN. `generateC` already decided what a WHEN
  block means, and this file follows it rather than inventing a second answer."*
- It answers **"what is the tick?"** explicitly, for that device, with measured
  numbers — and records where an earlier answer was wrong and load-bearing.
- It **refuses by name** the forms it cannot lower.

**The correctness standard is the round trip.** From
`sb3-creator-chost.js`: *"blocks → C → pseudocode → blocks has to land on the
same project, which is what proves the emission loses nothing."* `TWO_WAY` is
`pseudocode, python, javascript, c, basic`; 8086 assembly reads back too, and
everything else is one-way generated evidence.

## First: which Verilog?

This note originally collapsed "Verilog" into "synthesisable Verilog", which is
wrong and hid an option. Verilog is a full procedural language, and this is
perfectly good Verilog:

```verilog
module demo;
    integer i;
    initial begin
        for (i = 0; i < 5; i = i + 1)
            $display("%0d squared is %0d", i, i * i);
        $finish;
    end
endmodule
```

It is also **not synthesisable**. `initial`, `integer`, `$display` and
`$finish` are simulation constructs: they describe something a simulator does,
not something a chip is. So there are three targets here, not one, and they
have very different costs:

| | What it is | Can this app RUN it? |
|---|---|---|
| **V1** structural / combinational | what `modelToVerilog` emits today | **yes**, end to end — synthesis → netlist → gate sim → real pins |
| **V2** behavioural testbench | the example above | **no** — see below |
| **V3** synthesisable behavioural (FSM) | variables as registers, statements as states | in principle yes; nothing emits it |

**The app has no event-driven Verilog simulator.** The simulation tier is
GATE-level: `lib/bw-fpga/sim.js` wraps digitaljs' headless core and
yosys2digitaljs, i.e. it simulates a *synthesised netlist*. There is no
iverilog, verilator or vvp anywhere in the tree, and `sim.js`'s own header
shows why adding one is not a small decision — it documents rejecting package
entry points over licence (`EPL-2.0` excluded, a WTFPL-only dependency
avoided) and over bundle size.

So V2 is the shape that is **easiest to emit and impossible to execute**. A
`for` loop with `$display` maps almost one-to-one from the block IR — easier
than C, because printing needs no runtime call — and then nothing in the app
can run the result.

That matters because of a pattern the Code tab otherwise holds: every target
reaches its device. C compiles and runs on an MCU; 8086 assembly assembles and
boots the DOS bench; BASIC runs on the BBC bench. **V2 would be the first
target that is text and nothing else.**

There is precedent for that, though, and it should be weighed rather than
assumed fatal: NQC is compiled in the browser for a LEGO RCX that is not
present, and the ASM tab has a "listing mode: generated read-only evidence".
Emit-only targets exist in that strip already.

## Why a FULL Verilog backend is not simply the next backend

Two questions decide it, and they are the same two the 8086 file asks.

**What is the tick?** Every existing target has a CPU that executes statements
in sequence; `wait` is a timing call. An FPGA has a clock and no CPU, so
"statements in order" has to become a state machine. The question has an
answer, but it is a different one.

**What runtime do you call?** This is the real asymmetry. C stands on a 152 KB
runtime. On fabric there is nothing to call: variables would have to become
registers, the scheduler an FSM — you would have to *synthesise* the runtime.
Every other backend stands on a library. Even the 8086 backend, which has no
high-level runtime, at least has a CPU to lower onto. **Verilog has to build
the machine.**

So a full-parity Verilog backend is a bigger job than the 8086 one, not a
smaller one.

## What already exists, and what it buys

The FPGA lab holds a second IR — a gate model (netlist) — and the path from it
to Verilog and back is built and tested:

```
fn(row) → truthTableFrom → synthesizeTruthTable → modelToVerilog → .v
                           (+ Quine–McCluskey)     (gate-builder.js)

.v      → verilogToModel → model        ("parse structural Verilog emitted by
                                          gate-builder back into a model")
```

`truthTableFrom(inputs, outputs, fn)` takes a **function** and enumerates it.
That is the bridge primitive: it means a pseudocode expression does not have to
be *translated* into hardware, only **evaluated**, and the resulting truth table
synthesised. The circuit is then correct by construction on every input, and
the equivalence is checkable by the same enumeration that produced it.

**Do not evaluate by generating JavaScript and running it.**
`lib/bw-debug/condition.js` settles this for the whole repo: *"That would run
arbitrary code from a project file with full page access, in an editor whose
whole point is that children load each other's projects."* It parses a small
grammar instead, and rejects what it cannot parse *with the reason*. A boolean
subset of pseudocode is a grammar of about that size.

## Could we have an event-driven simulator?

Asked properly, because the answer above ("no") was too short.

### What exists, and under what licence

| Simulator | Licence | Under the current `PERMISSIVE` set |
|---|---|---|
| **Icarus Verilog** | GPL-2.0-or-later | refused — and it is the only true *interpreter* of the three |
| **Verilator** | LGPL-3.0 **or Artistic-2.0** | LGPL refused; Artistic-2.0 is not in the set |
| **CVC / Tachyon** | GPL | refused |
| **Yosys** | **ISC** | already shipped |
| **CXXRTL** (a Yosys backend) | ISC | already shipped |
| Verible, Surelog | Apache-2.0 | fine, but they are front-ends, not simulators |
| VTR | MIT | fine, but it is place-and-route |

No permissive, embeddable, event-driven Verilog interpreter appears to exist.

**Where Artistic-2.0 differs, and why it is not a one-line edit.** MIT / ISC /
BSD attach essentially only attribution. Artistic-2.0 attaches conditions to
MODIFIED versions — ship a patched copy and you must publish source, or rename
so it cannot be confused with the Standard Version, or similar. The obligations
therefore change the day someone patches the dependency, which is a standing
liability rather than a one-off review. (The precise clause obligations,
especially around compiled form, need a real read by whoever owns the call.)

There is also a wrinkle in *where* that list lives. `licence.js` calls it
"SPDX ids we treat as shippable, matching THIRD-PARTY-NOTICES.md's set", and
the same regex decides **which user HDL the hosted synthesiser accepts**.
Amending it to admit a bundled dependency would silently change what the server
accepts from learners. Two decisions sharing one constant; they should be
separated before either is changed.

### What the bundled Yosys actually has — measured, 2026-09-22

`@yowasp/yosys` 0.70.62-dev, licence **ISC**, **295 commands**:

| | |
|---|---|
| `sim` | **absent** |
| `write_cxxrtl` | present — but emits C++ |
| `eval`, `sat`, `equiv_simple`, `write_simplec` | present |

So the shipped toolchain has **no event-driven simulator**, and the hoped-for
free answer is not there.

`eval` and `sat` are a genuine find for the V1 path though: `eval` computes a
synthesised design's outputs for given inputs, and `sat` / `equiv_simple` do
formal equivalence. That is a stronger proof than enumerating a truth table —
it could show a generated circuit is equivalent to its source rather than
merely agreeing on every row we happened to drive.

To reproduce (the wasm needs a newer Node than the dev box's 20, and a flag):

```bash
curl -sLO https://nodejs.org/dist/v22.11.0/node-v22.11.0-linux-x64.tar.xz
tar xf node-v22.11.0-linux-x64.tar.xz
cd packages/scratch-gui && ../../node-v22.11.0-linux-x64/bin/node \
  --experimental-wasm-exnref --input-type=module -e "
const m = await import('@yowasp/yosys');
const dec = new TextDecoder(); let out = '';
const sink = b => { if (b) out += dec.decode(b, {stream: true}); };
await m.runYosys(['-p','help'], {}, {stdout: sink, stderr: sink});
console.log(out);"
```

`stdout` is an `OutputStream` — `(bytes: Uint8Array | null) => void`, where
`null` ends the stream. Passing a string-concatenating callback silently yields
comma-separated byte numbers, which reads like a broken build rather than a
wrong callback.

### The boundary changes the answer

"Icarus is GPL" is not the end of it. GPL obligations attach to what is
**conveyed**, not what is **used**, and this repo already relies on three
different boundaries:

1. **A hosted service.** `synth.crispstro.be` already runs the toolchain
   server-side. Running GPL software as a service and returning results is not
   conveying the program (GPL-2/3 carry no network clause; AGPL would differ).
   The hosted assembler for 8051/6502/Z80/AVR is the same shape.
2. **A local tier.** Already the documented answer for copyleft input:
   *"refused on the shared server and must be built locally"*, on the reasoning
   in `licence.js` that *"building it on the user's own machine conveys
   nothing."*
3. **A separately published wasm, loaded on call.** `@yowasp/yosys` is already
   exactly this — `npm install --no-save` in CI, with `yosys-absent.js` as the
   stub when it is missing. A tool invoked with argv and a filesystem is the
   classic arm's-length shape rather than linking.

So an event-driven simulator is **not** ruled out; it is a question of which
boundary, and the project has precedent for all three.

**This note does not decide that.** Whether a given boundary discharges a
particular obligation is a judgement for a person, not for this file. What is
recorded here is only that the shapes exist and are already in use.

## Measured: how much shipped pseudocode is in the subset?

This note listed the question as open — *"worth measuring against the shipped
examples before building: if almost nothing qualifies, C is the better shape."*
It has now been measured, by `scripts/measure-verilog-subset.mjs`, over every
`program.bw` in `overlay/scratch-gui/examples`:

| | count | share |
|---|---|---|
| programs measured | **282** | |
| contains any boolean operator (`AND`/`OR`/`NOT`, comments excluded) | 6 | 2.1 % |
| …where an operand is a **1-bit `INPUT` pin** | **0** | **0.0 %** |
| whole program is combinational (no time, no state, no analog) | **0** | **0.0 %** |

**Nothing in the shipped corpus qualifies.** All six boolean-using programs
compare multi-bit program VARIABLES — `IF hit >= 0 AND key < 0`,
`IF key_input = "0" OR key_input = "1" …`, `IF op = 4 AND NOT entry = 0` — which
is the multi-bit question this note already flagged as out of scope, not a gate
over pins.

Why whole programs fall outside, counted across the corpus (a program can have
several reasons):

| reason | programs | share |
|---|---|---|
| `wait` (time) | 134 | 47.5 % |
| `set` (variable state) | 107 | 37.9 % |
| `FOREVER` (loop) | 100 | 35.5 % |
| analog/PWM pin | 50 | 17.7 % |
| `change` (variable state) | 32 | 11.3 % |
| `REPEAT` (loop) | 16 | 5.7 % |
| `timer` | 3 | 1.1 % |

**The honest caveat:** these examples exist to demonstrate BOARDS, so they are
device-control programs by construction and biased away from pure logic. The
number is a fact about the shipped corpus, not a proof about every program a
learner could write. But it is exactly the corpus a learner opens, and it means
that today, opening any shipped example and switching to a Verilog subtab would
produce a refusal — every time, with no worked example anywhere in the product
to learn the feature from.

A zero is also the one result indistinguishable from a broken scan, so
`test/verilog-subset-census.test.mjs` holds the detector to fixtures that MUST
count (a two-input `AND` over `INPUT` pins, which it accepts) and MUST NOT (the
same expression over variables, or touching an `ANALOG` pin). The corpus number
itself is reported as a diagnostic rather than asserted, because example
programs are allowed to change.

## The options

### A. Combinational subset, as a Code-tab subtab

Boolean expressions over 1-bit inputs become a circuit; everything else is
refused by name.

- **Round trip closes.** `pseudocode expr → model → Verilog` and
  `Verilog → model → pseudocode expr` both run through the existing model, so
  the repo's correctness standard is met rather than waived.
- **No runtime needed** — because there is no state. That is why it works.
- **The grammar's limits are the hardware's limits.** Anything the parser
  refuses is exactly what cannot become combinational logic, so the refusal
  falls out of the parser instead of needing separate synthesisability
  detection that could be wrong.
- **Small.** A ~40-line parser in the shape of `condition.js`, plus glue and
  tests; the synthesis half is already tested.
- **Cost:** only a narrow slice of programs produce anything at all.

### A2. Behavioural testbench Verilog (V2), emit-only

Emit the program as `initial begin … end` with `for`/`if`/`$display`.

- **Cheapest of all to emit.** The block IR already has the control flow; there
  is no runtime to write, because `$display` is the runtime.
- **The round trip closes easily**, by the `asm-8086-to-pseudocode.js`
  argument: the Verilog is machine-written in a shape this repo controls, so
  reading it back is a small recursive-descent pass over a known subset, not a
  Verilog parser.
- **Nothing here can run it**, and it would be the first Code-tab target that
  is text only. Precedent exists (NQC, ASM listing mode) but it is a real step
  down from "every target reaches its device".
- **The honest pedagogical case**, and it is not nothing: the gap between
  simulation Verilog and synthesisable Verilog is one of the first things an
  HDL beginner has to learn, and showing the same program in both — one that
  prints, one that becomes gates — teaches exactly that. Emitting V2 *and*
  refusing to synthesise it, with the reason, is a lesson rather than a
  shortfall.
- **The trap:** shipping V2 alone would let a learner believe they had
  "programmed an FPGA" when they had written something no chip can be.

### B. Full lowering to an FSM (high-level synthesis, V3)

Variables become registers, statements become states, `wait` becomes a counter.

- Parity with the other targets: any program becomes hardware.
- **The round trip does not close.** Reading an FSM back into blocks is
  decompilation, not parsing a known subset, so `TWO_WAY` is off the table and
  with it the repo's proof of correctness.
- The output is generated FSM Verilog: a fine engineering artifact, but
  unreadable as a lesson, in a tab whose other outputs a learner can read.
- Larger than `pseudocode-8086.js`, which is itself substantial.

### C. An action, not a tab

A "⚙ Make this a circuit" button on a pure expression, handing off to the FPGA
gate builder.

- Cheapest, and matches the existing `⤓ Use as Verilog` / `Use as Canvas`
  handoffs.
- Loses the round trip and the "Verilog is a language like the others" framing.

### D. An event-driven simulator, behind a boundary

Any of the three boundaries above, most plausibly Icarus as a hosted service or
as a separately published wasm loaded on call.

- **It is the only option that runs arbitrary user Verilog**, including the
  testbench constructs. Everything else here handles a subset.
- Makes V2 real rather than emit-only, and would let the FPGA tab run a
  learner's own testbench.
- **Needs a licence judgement from a person**, per the boundary section. The
  shapes are precedented; the decision is not this note's to take.
- Largest operational cost of anything here: a service to run and keep up, or a
  package to publish and version.
- Worth separating in the mind from the transpiler question entirely — it is
  useful whether or not pseudocode ever emits Verilog.

### E. Prove V1 with `eval` / `sat` instead of enumerating

Not a simulator at all: use the Yosys commands already shipped to show a
generated circuit matches its source.

- **Stronger than the truth table.** Enumeration proves agreement on the rows
  driven; `equiv_simple` / `sat` addresses equivalence as a property.
- ISC, already in the bundle, no new dependency, no licence question.
- Only applies once something emits V1; it is a way to make option A
  trustworthy, not an alternative to it.
- Unverified: whether these commands behave usefully through the wasm wrapper
  on designs this small. Measuring that is a contained experiment.

## Recommendation

**REVISED 2026-09-23, by the measurement above: C, not A.**

A was recommended on the strength of the round trip, and that argument still
holds — but it was recommended *before* anyone counted how much pseudocode it
would apply to, and this note said so. The count is **0 of 282**. A subtab whose
every visit is a refusal is not a language target a learner can hold; it is a
dead tab with a good explanation attached, and the ASM precedent does not rescue
it, because ASM refuses SOME programs while producing real listings for others.

**C's compiler half now exists**, as
`overlay/scratch-gui/src/lib/bw-fpga/pseudocode-expr.js`: the grammar in the
shape `condition.js` set, lowering `a AND NOT b` to the gate model the FPGA tab
already synthesises. Its limits ARE the hardware's limits, so the refusal falls
out of the parse rather than needing a second synthesisability check — and the
census above now calls that parser instead of approximating it with a regex, so
the reasons reported are the ones a learner would be shown (26 comparisons, 9
names that are not pins). What is NOT built is the affordance itself: where the
button lives, and what it hands to the builder.

C — "⚙ Make this a circuit" on an expression, handing off to the FPGA gate
builder — keeps everything the measurement does not contradict: the same narrow
lowering, the same refusal-by-name, and no promise that pseudocode is an HDL. It
costs the round trip and the "Verilog is a language like the others" framing,
which is a real loss, and it is the right one to take when the alternative is a
tab that is empty for every shipped example.

**What would change the answer:** examples written as logic rather than as
device control. If the curriculum gains pure-combinational exercises — the FPGA
learning path's own realise challenges are exactly that shape — the count stops
being zero and A becomes live again. That is a curriculum decision, not a
compiler one, and re-running `scripts/measure-verilog-subset.mjs` is how it
would be noticed.

The original argument for A, kept because it is still the reason to prefer A
if the corpus ever changes:

**A, modelled on the ASM subtab rather than on Python.**

The objection to a Verilog subtab used to be "a learner switches to it,
expects their program, and gets a refusal." That is precisely what ASM already
does in that strip:

> *"To blocks: 8086 assembly that ▶ Run on 8086 produced reads back; anything
> else is refused by name, with a count."*

Refusal-by-name, modes, and handing execution to another route
(`assemble-route.js`) are all established there. A Verilog subtab fits that
precedent; it simply is not the Python precedent. Synthesis, pin constraints
and the board stay in the FPGA tab, the way ASM hands off to the assembler.

B stays out until something needs it, and it should be a separate decision with
its own note — not a later "extension" of A, because it abandons the round trip
that justifies A.

**D is a separate question and should be decided separately.** An event-driven
simulator is useful whether or not pseudocode ever emits Verilog — it would let
a learner run their own testbench in the FPGA tab today. Bundling it into this
decision makes both harder. The measurement above (no `sim` in the shipped
Yosys) means it cannot be had for free, so it needs someone to choose a
boundary and accept the operational cost.

**E is cheap and should be tried early if A proceeds**, because it changes what
A can claim: "this circuit agrees with your expression on every row we drove"
versus "these are equivalent".

## What is still open

- **Would a small interpreter for the V2 subset be worth it?** We emit it, so
  we could run it, the same way the 8086 reader parses a subset this repo
  controls. That would restore "the target reaches its device" without adding
  iverilog. Unknown: whether running a `$display` loop teaches anything the
  Code tab's other targets do not already.
- ~~**How much pseudocode is actually in the subset?**~~ ANSWERED above:
  0 of 282 shipped programs. That is what moved the recommendation to C.
- **Multi-bit values.** The gate model is 1-bit-per-net with a `width` field;
  whether `x > 3` on a 4-bit input is in scope changes the parser's size.
- **Where the refusal is shown.** ASM refuses "by name, with a count"; the
  same UX should be copied rather than re-invented.
- **Naming.** The FPGA tab already has a Verilog box. Two places showing
  Verilog needs a story a learner can hold.
