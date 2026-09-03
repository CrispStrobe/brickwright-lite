# The 8086 tier — core plan and status

Started 2026-09-03. The retro tier gains a third CPU beside the W65C02 and the
Z80, built the same way and verified to the same standard.

**Status: the core and the disassembler are done and vector-complete. Nothing
is wired to them yet.**

| Piece | Where | State |
|---|---|---|
| `I8086` core | `bw-board/src/i8086.js` | **646,000/646,000 vectors, 323/323 files** |
| Vector grinder | `bw-board/scripts/grind-i8086.mjs` | green, ~60 s for the full suite |
| Always-on subset | `bw-board/test/i8086.test.mjs` + `i8086-disasm.test.mjs` | 23 tests, green |
| Disassembler | `bw-board/src/i8086-disasm.js` | **646,000/646,000 vectors, text AND length** |
| Disassembly grinder | `bw-board/scripts/grind-i8086-disasm.mjs` | green, 3 vectors excluded (§4b) |
| Machine + adapter | `i8086-machine.js`, `i8086-adapter.js` | not started |
| Debug target | `i8086-debug.js` | not started |
| Vendored into Lite | `overlay/…/bw-board/` | **deliberately not yet** — see §6 |

## 1. Why a core of our own rather than an adoption

The permissively-licensed field was surveyed first. Nothing in it drops into
this architecture:

- **MartyPC** (MIT, Rust) is the most accurate 8088/V20 emulation in existence
  and its author built the hardware validator that generated the tests used
  here — but it is a whole IBM 5150/5160 with an egui front end, not a
  bus-agnostic CPU.
- **PCjs** (MIT, JavaScript) has a real 8088 and a real debugger, in ~700 KB of
  ES5 spread across eight files covering 8088 through 80386 and coupled to its
  own Bus/Memory/Component globals.
- **8086tiny** (MIT) is deliberately obfuscated code golf. **v86** (BSD-2) is a
  686-class PC with a JIT. **YJDoc2/8086-Emulator** (Apache-2.0) and
  **Amey-Thakur's** browser simulator (MIT file, `CC BY 4.0` in every source
  header) both interpret *assembly text*, not machine code — neither ever
  fetches an opcode byte, so neither can run a binary, be wired to a bus, or be
  validated against vectors.
- Everything else worth having is GPL: 86Box, Faux86, Fake86, XTulator, pce,
  DOSBox, PCem, Unicorn.

What *was* adoptable is the ground truth: **SingleStepTests/8086** (MIT), 324
opcode files × 2,000 vectors, generated on an Intel P80C86A-2 with ArduinoX86.
That is the same kind of oracle that produced `z80.js` and `w65c02.js`, so the
method carried over unchanged and the core is ours, under BSD-3, with nothing
vendored and nothing to add to `THIRD-PARTY-NOTICES.md`.

The suite is 526 MB and lives out of the tree:

```bash
git clone --depth 1 https://github.com/SingleStepTests/8086 ~/code/8086-vectors
cd ~/code/bw-board && node scripts/grind-i8086.mjs
```

`about-data.js:176` already lists *"SingleStepTests 65x02 + Z80 — MIT — Per-instruction
CPU test vectors"* in the CI-oracle role. That entry becomes **65x02 + Z80 + 8086**
when the tier ships; the role does not change, because none of it is distributed.

## 2. What the core is

`class I8086` with the house contract: `constructor(bus)` taking
`{read, write, in, out}`, `step()` executing one instruction and returning its
cycle cost, and a throw for anything unimplemented so the grinder can score
NOT-YET and never mistake a gap for a pass.

Three things differ from every other core in the tree, and each is a bug
waiting to happen in code that assumes the Z80 shape:

- **Addresses are 20 bits.** The bus sees `(seg << 4) + off` wrapped at 1 MB.
  Every `& 0xffff` in a debug layer written for the Z80 is wrong here.
- **Offsets wrap at 16 bits *inside* the segment.** A word at offset `0xffff`
  takes its high byte from offset `0x0000` of the same segment.
- **There is no single program counter.** CS:IP is the pair. `cpu.pc` is a
  derived flat address for the debugger to anchor on and must never be written
  back.

Cycle counts are the published 8086 timings plus the EA cost. They are **not**
vector-verified and the grinder does not compare them: the suite's cycle arrays
are prefetch-queue-inclusive bus traces from real silicon, which an
instruction-stepped core has no way to reproduce. The Z80 grinder compares
cycles because that suite's counts are instruction-local. This one cannot, and
the module header says so rather than implying a tier the core does not hold.

Also not modeled, deliberately: the prefetch queue and BIU, the 8087 escape
(`D8`-`DF` read their operand and stop), INTR/NMI delivery (the machine layer's
job), and the erratum where an interrupt taken mid-`REP` loses a segment
override — with no interrupt delivery there is nothing for it to happen to.

## 3. What the vectors actually taught

Nine behaviors cost a debugging session each. They are listed here because
every one of them is invisible in the Intel manual, and three of them
contradict it outright.

1. **`PUSH SP` stores SP−2.** The register is read *after* the decrement. The
   286 changed this, and detecting the difference is how period software tells
   the two apart.
2. **DAA and DAS do not follow Intel's published pseudocode.** The manual says
   the high correction applies when the original AL exceeded `0x99`. The
   silicon applies it for `0x9a`–`0x9f` only when **AF was clear** — so `DAA`
   on AL=`0x9a` yields `0xa0` with AF set and `0x00` with AF clear, from the
   same AL and the same low correction. Carry out is then exactly "the high
   correction happened": a borrow out of the low correction does not set it,
   which `DAS` on AL=`0x00`,AF=1 proves (`0xfa`, carry clear). The published
   rule misses 17 of 2,000 DAA vectors and 37 of 2,000 DAS. The fitted rule
   misses none.
3. **A `REP` prefix on `IDIV` negates the quotient.** Not an ignored prefix —
   the sign-correction step runs an extra time. The suite prepends `REP` to a
   share of every string-capable opcode, which is the only reason this is
   visible at all.
4. **`IDIV` range-checks the magnitude,** so a quotient of exactly −128 (byte)
   or −32768 (word) faults where −127 and −32767 do not.
5. **`AAM 0` divides by zero** and, before faulting, leaves the flags of a zero
   result (ZF and PF set) while AX is untouched. `INT 0` then pushes exactly
   that.
6. **`D0`–`D3` reg=6 is `SETMO`/`SETMOC`,** an undocumented instruction that
   sets the operand to all ones — not an alias of `SHL`.
7. **Rotates touch only CF and OF.** SZP and AF survive them. Shifts set SZP.
   OF is defined only for a count of one, and a count of zero changes nothing
   at all, flags included.
8. **Shift counts are not masked.** `SHL AX, CL` with CL=33 really shifts 33
   times. The `& 31` masking is 80186 and later.
9. **The FLAGS word has hard-wired bits**: bit 1 and bits 12–15 always read 1,
   bits 3 and 5 always 0. `PUSHF` hands them straight back out, so a core that
   stores a "clean" flags word fails every vector that touches the stack.

Plus the decode facts the suite's own `metadata.json` confirms: `0x60`–`0x6f`
alias onto `0x70`–`0x7f`; `0xc0`/`0xc1`/`0xc8`/`0xc9` alias onto the returns;
`0x82` aliases `0x80`; `F6`/`F7` reg=1 is `TEST`; `FF` reg=7 is `PUSH`;
`8C`/`8E` use only two bits of the reg field; `0x0f` is `POP CS`; `0xd6` is
`SALC`; `0xf1` decodes as `LOCK`.

## 4. The one place the harness bends, and why

`DIV` and `IDIV` leave their flags undefined, and the suite says so with a
`flags-mask` in `metadata.json` — but an overflowing divide takes `INT 0`, and
`INT` pushes FLAGS **to memory**, where RAM is compared byte-exactly. Comparing
that word exactly would contradict the mask applied to the identical value in a
register a line earlier.

So the grinder applies the same mask to the pushed word, and only when the test
actually took an interrupt (SP down by six) on an opcode that declares
undefined flags. Every other pushed byte is compared exactly. This is the
suite's own undefined-flag contract followed through to where the flags landed,
not a licence to stop checking the stack.

Reproducing those bits for real would mean emulating the divide microcode's
shift-subtract loop, which is MartyPC's territory and worth nothing to a
teaching workbench: a program that reads flags after `DIV` is already broken.

## 5. The road, in three machines

The tier is not one machine and should not be planned as one. Tier A is a
breadboard computer in the shape this engine already builds; Tier B is a
service layer with no hardware in it at all; Tier C is a PC/XT. Each is
independently useful, and only Tier C is expensive. The engine-side items live
in `bw-board/ROADMAP.md` §E6; this is the product view.

**Measured before promising anything.** The core runs at **4.0 M
instructions/sec** on a representative mix (register ALU, memory read/write,
taken branch, call/ret) — 12× a 5 MHz 8086 and about 16× a 4.77 MHz IBM XT.
Software of that era was written for 0.24 MIPS, so the CPU is not the
bottleneck at any tier; video timing is. That figure is Node; re-measure in
the browser bundle before quoting it there.

**8088 comes free.** The ISA is identical. The differences — bus width, a
four-byte prefetch queue instead of six, cycle timings — are precisely the
things an instruction-stepped core does not model, so `I8086` *is* an 8088
except for cycle counts. `SingleStepTests/8088` (with bus data) and `/v20`
are also MIT if the tier ever wants an NEC V20 or cycle-level work.

### Tier A — the 8086 on a breadboard  *(M3, M4; next)*

The direct analogue of the Eater 6502 and the Searle Z80, chip for chip. This
is where an LED blinks from an 8255 port, where the MCU examples adapt, and
where the references point: slador.uk's machine is 8088 + 8284 + 8254 + 8255
+ 8259 + 74244 + 74138 + flash + text LCD, and the Proteus tutorials are its
first lesson.

**M3 — the machine.** `i8255.js` (ports A/B/C, control word, mode 0, and the
BSR bit-set/reset path; modes 1 and 2 a stated non-goal until a lesson needs
them), `i8086-machine.js` in the `m6502-machine.js` shape with the address
space widened to twenty bits and a *second* decode space for I/O ports, and
`i8086-adapter.js` on the boundary-A pin bus.

**M4 — the debug target.** `i8086-debug.js` mirroring `z80-debug.js`.
Decisions already forced by the architecture: `regs()` returns the segment
registers alongside a derived flat `pc`; **code breakpoints compare on the
linear address**, because two `seg:off` pairs can name one instruction and
only the linear form cannot be fooled; write watchpoints wrap `cpu.write` as
the Z80 target does with the mask widened to `0xfffff`; step-over needs its
own call-class test (`E8`, `9A`, `CD`, `CC`, and `FF` reg 2/3).

**M5 — interrupts and time.** `i8259.js` and `i8254.js`, plus INTR/NMI
delivery in the machine layer with the IF check and the one-instruction
inhibition after a segment-register load. The core deliberately does not
deliver interrupts itself.

**M6 — the wired machine.** `i8086-extract.js` and the extractor SELECT
entries, so an 8086 hand-wired on the drawn breadboard becomes a machine — or
a named refusal — exactly as the 6502 does. Plus our own monitor ROM.

### Tier B — the DOS-program tier  *(no hardware at all)*

The 8086 textbook corpus does not want a PC. Measured across the 525 programs
of `Amey-Thakur/8086-ASSEMBLY-LANGUAGE-PROGRAMS`:

```
int 21h  3109   of which AH=02h 1347, AH=09h 1064, AH=4Ch 451
                → 2862 of 3109 in three services
int 10h    79   int 16h 26   int 1Ah 10   int 15h 8   int 33h 6
502 of 525 files use .MODEL / PROC / MACRO
```

So the DOS/BIOS service layer is a few hundred lines and covers roughly 92% of
the corpus with three functions, and no BIOS ROM or DOS is involved at all.
**The gate is the assembler, not the emulator**: these are MASM sources, and
`bw-asm` does not speak `.MODEL`, `PROC` or `MACRO` yet. Scope that honestly
before promising the corpus — it is the larger half of this tier by far.

### Tier B′ — emu8086 compatibility  *(smaller, separate)*

`yousefkotp/8086-Assembly-Projects` is not DOS software. It is emu8086:
`#start=Traffic_Lights.exe#`, `out 4, ax` to a built-in traffic-light device,
`int 15h`/`AH=86h` delays, `include 'emu8086.inc'`. Running it means
emulating emu8086's virtual peripherals and **re-implementing** its macro
library — the `.inc` carries no licence we can rely on. This is the tier that
makes traffic-light, stepper and thermometer lessons possible, and it lands
after Tier B.

### Tier C — PC/XT compatible  *(the expensive one)*

8237 DMA, 6845/CGA (`mc6845.js` already exists), a µPD765 FDC and disk
images, plus a BIOS and a DOS. Months of work and a different product from
"learn the 8086 on a breadboard". Start it when tiers A and B are shipped and
a lesson actually needs it — not before.

### Not in this lane at all

`jonasb.at/blog/breadboard-chip-8` has **no CPU**. It is 74LS181 ALUs, 74HC377
registers and microcode in flash with an FPGA GPU — a discrete-logic machine,
closer to the SAP-1 lane than to this one. Worth building someday; not here.

### Licence rulings (verified 2026-09-03)

| Source | Licence | Ruling |
| --- | --- | --- |
| SingleStepTests 8086 / 8088 / v20 | MIT | Oracle only, never shipped — the role `about-data.js` already records for the 65x02 and Z80 suites. |
| `microsoft/MS-DOS` 1.25, 2.0, 4.0 | MIT | Usable. A genuine DOS exists for Tier C if it ever wants one. |
| Amey-Thakur `.asm` corpus | MIT, per file header | Shippable as examples **with attribution**. Note that the same repo's *simulator* sources say `CC BY 4.0` in every header while its LICENSE says MIT — take the programs, not the simulator. |
| GLaBIOS | GPL-3.0 | Refused. The best open BIOS is out of reach. |
| `skiselev/8088_bios` | GPL-3.0 | Refused. |
| `GREENSHELLRAGE/8086-breadboard-computer` | **no LICENSE file** | All rights reserved. The architecture may inspire — that is not copyrightable — but its ROM binaries and `.asm` may not be copied. |
| `emu8086.inc` | unclear | Refused. Re-implement the macros. |
| MartyPC, PCjs | MIT | Readable as reference implementations. Reading an MIT implementation ships no third-party code. |

The consequence is worth stating plainly: **every ROM in this tier is ours**,
at every tier. That is a real cost, and it is also the only reason the tier
can ship inside a BSD-3 bundle at all.

## 6. Why the core is not vendored into Lite yet

`i8086.js` lives in `bw-board`, which is where `z80.js` and `w65c02.js` live and
where `npm run sync:bwboard` pulls from. Vendoring it into the overlay before
the adapter and debug target exist would land a module that nothing imports —
which is exactly what `test/no-dead-overlay-modules.test.mjs` exists to catch,
and it would be right to. The core rides in with M3.

## 7. M2, and the standard the suite made possible

The suite ships a **disassembly string** with every vector — `name`, beside
`bytes`. That is a text oracle, and it is a stronger standard than either of
the other two disassemblers in this tree is held to: `z80-disasm` and
`w65c02-disasm` have their lengths ground against vector pc-deltas and their
*formats spot-checked by hand*. `grind-i8086-disasm.mjs` checks both halves
against all 646,000, and it passes.

Matching a real disassembler rather than inventing a house style forced five
rules that each look like a bug:

- A memory operand **always** names its segment, override or not, and always
  carries `byte`/`word`/`dword` — except `lea`, which carries none, and
  `les`/`lds`, which say `dword` where `callf`/`jmpf` say `word`.
- A segment override is spelled out as a bare prefix word (`cs movsb`) **only**
  for the string primitives, whose operands are implicit. Elsewhere it lives in
  the brackets, and where there is no memory operand it is not shown at all,
  because it did nothing.
- A displacement is printed because **mod says one was encoded**, not because
  it is non-zero: `[ss:bp+si+0h]` is correct and `[ss:bp+si]` is not.
- Jump targets zero-pad to four digits and far pointers pad both halves;
  immediates pad to nothing. `jle 002Bh` and `mov bl, 2h` in one syntax.
- `rep` on `movs`/`stos`/`lods` is spelled `rep`; on `cmps`/`scas`, which read
  the zero flag, it is `repe`/`repne`. And `D2`/`D3` reg=6 is `setmoc`, not
  `setmo`: the CL-counted form is conditional and named for it.

**Two things the vectors caught that no hand-written test would have.**

*Instruction fetch wraps at the segment boundary, not the linear one.* One
vector in 646,000 starts at IP `FFFCh` and takes its fifth byte from offset
`0000h` of the same segment. Reading straight on through the linear address
disassembles a different instruction. The module now takes the real IP and
fetches through `base + ((ip + i) & 0xffff)`.

*What a relative target is measured from is a rendering choice, not a decoding
one.* The suite's disassembler measures from the instruction's own start (IP
treated as zero); a debugger pane wants the address in the segment. The module
does the useful thing by default and takes `targetBase: 0` for the suite's
convention, rather than baking a test convention into the product.

### 4b. Three vectors where the suite is wrong

`80.6 #1311`, `81.2 #1261` and `B7 #658` each sit at IP `FFFEh` or `FFFFh`,
and each one's `name` contradicts its own `bytes` — the name was rendered from
a byte that was never fetched. The `bytes` array is the capture, and the
register and memory results agree with it, so disassembling the bytes is right
and matching the name would be wrong.

They are excluded by `test_hash`, with the reason written beside each, and the
grinder still requires the right **bytes** for all three — only the text is
excused. If a regenerated suite ever agrees, the run prints `HEALED` and the
table should lose a row: an excuse that has stopped being true is worse than
no excuse.
