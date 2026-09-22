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

## Why Verilog is not simply the next backend

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

### B. Full lowering to an FSM (high-level synthesis)

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

## Recommendation

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

## What is still open

- **How much pseudocode is actually in the subset?** Worth measuring against
  the shipped examples before building: if almost nothing qualifies, C is the
  better shape.
- **Multi-bit values.** The gate model is 1-bit-per-net with a `width` field;
  whether `x > 3` on a 4-bit input is in scope changes the parser's size.
- **Where the refusal is shown.** ASM refuses "by name, with a count"; the
  same UX should be copied rather than re-invented.
- **Naming.** The FPGA tab already has a Verilog box. Two places showing
  Verilog needs a story a learner can hold.
