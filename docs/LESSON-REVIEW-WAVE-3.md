# Wave 3 technical review — "One idea, several languages"

Reviewed 2026-08-23 against `a3f30be6b`. Twelve lessons, twenty-four checkpoints,
sixty-two declared language variants.

**1 defective of 12 · 1 revised to content version 2 · the healthiest wave so far.**

Wave 3 teaches one idea across several representations, so its achievability
question is different again: not "can the bench produce this reading" (Wave 1–2)
nor "can the debugger show this" (Wave 5), but **can the app actually render each
language this lesson names, for this example?** A lesson that promises a Python
view of a program the compiler cannot emit Python for is the same defect class in
a new costume.

That is directly measurable, so it was measured: every lesson's declared
languages were generated from its own example's `program.bw`, through the same
`sb3-creator` the browser bundles.

## The language matrix, generated not assumed

Instrument check first: the integrated compiler used for this run is
byte-identical to the overlay copy (814,553 bytes), so this is lite's compiler
and not a sibling checkout's.

```
lesson                       example                          pseudo  blocks  python  js      c       asm
languages-sequence           13-sos-morse                     26L     20b     64L     46L     82L     –
languages-events             11-toggle-button                 14L     11b     60L     33L     61L     –
languages-conditions         arduino-05-if-statement          18L     11b     61L     40L     118L    –
languages-state-machine      14-traffic-light                 20L     12b     58L     37L     69L     –
languages-loops              arduino-05-for-loop              52L     38b     89L     68L     115L    –
languages-variables          05-counter                       20L     16b     64L     43L     76L     –
languages-procedures         13-sos-morse                     26L     20b     64L     46L     82L     –
languages-concurrency        nano03-two-tasks                 18L     11b     57L     38L     157L    –
languages-arrays             arduino-05-arrays                31L     20b     69L     48L     95L     –
languages-messages           arduino-04-serial-call-response  15L     9b      52L     31L     107L    –
languages-pins-peripherals   arduino-01-read-analog-voltage   13L     9b      56L     34L     110L    –
languages-protocols          08-led-chaser-595                22L     20b     70L     47L     97L     NO EMITTER
```

Sixty-one of sixty-two variants render. Every program parses, produces blocks,
and emits Python, JavaScript and C. Nothing is empty and nothing throws. For a
wave whose entire premise is "the same idea in several languages", that is the
result you want and it is worth stating as a positive finding rather than only
listing the exception.

The benches carry what the checkpoints name, too — a potentiometer for
`languages-pins-peripherals`, six LEDs for `languages-arrays`, three for
`languages-state-machine`, eight for `languages-protocols`, buttons for
`languages-events` and `languages-variables` — and the serial console accepts
keyboard input as RX bytes, which `languages-messages` needs to "send a valid,
split, and malformed request".

## The one defect

### languages-protocols promised an ASM listing that needed the network

It is the only lesson in the catalog declaring `asm`, and there is no ASM
emitter: `sb3-creator` has `generatePython`, `generateJavaScript`,
`generateHostC`, `generateMicroPython`, `generateBASIC` and `generateC`, and
nothing for assembly.

That is not the whole story, and the rest of it is more interesting. The Code tab
*does* have an ASM view, with two modes — a **source** mode where the learner
writes assembly, and a **listing** mode described as "generated disassembly".
The source mode is still assembled by hosted `POST /assemble`. The listing used
to come from hosted `POST /compile`, even though `08-led-chaser-595` is
`DEVICE STC12C5A60S2` and the app now bundles the complete four-stage SDCC
toolchain.

So the variant is deliverable, but only online — while the lesson declares
`environment: "simulation"`, as do all twelve. The other five views for this same
lesson are generated in-bundle; I generated all five in Node with no network, so
that is measured rather than assumed.

**Feature restored**, version 3: Listing mode now reads the linked SDCC `.rst`
artifact locally. Unlike raw compiler ASM or the relocatable assembler LST, it
contains final addresses, bytes, and C source markers. A production Chromium
gate changes the source, requires two distinct linked listings, blocks hosted
compiler POSTs, and checks the view is read-only. The variant still discloses
that editable Source mode is a separate hosted assembler path. The 6502 Wave 7
lesson remains hosted and keeps its disclosure; this change reduces D12 from
two affected lessons to one rather than closing it by overstatement.

## What this wave turned up about Wave 5

Following the ASM listing to its source is what exposed the bigger finding now
recorded as Wave 5's defect 0: the **debugger** takes the same route. Every
device family Wave 5 uses routes through the same `POST /compile`, so all ten of
its lessons need a network connection before their first checkpoint, and all ten
also declare `simulation`.

Wave 3's asm variant is one view of one lesson. Wave 5's is the whole wave. I
found the small one first and only then looked upstream, which is the argument
for tracing a dependency to its origin rather than stopping at the first
component that answers the question.

## What I could not check

- **Whether the generated code is CORRECT**, only that it is produced. Sixty-one
  variants emitted; I read none of them for semantic fidelity to the pseudocode.
  A Python view that compiles but says something different from the blocks is
  exactly this wave's nightmare, and it is not covered here. `test/retarget.test.mjs`
  and the corpus differential cover parts of it; matching two *language views* of
  one program against each other is not something I found a gate for.
- **The variant prose.** Each lesson carries a one-sentence note per language.
  Those are pedagogy and are not machine-checkable.
- **The German copy**, revised for the one changed variant, not reviewed.
- **Whether the hosted compiler is reachable**, and what the ASM tab shows when
  it is not.

## Reproducing

The language matrix regenerates from
`test/lesson-language-matrix.test.mjs`, which fails if any declared variant stops
rendering — and asserts the compiler it used is byte-identical to the overlay's,
so a stale integrated tree cannot quietly change the answer.
