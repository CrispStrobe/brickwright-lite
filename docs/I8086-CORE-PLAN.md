# The 8086 tier — core plan and status

Started 2026-09-03. The retro tier gains a third CPU beside the W65C02 and the
Z80, built the same way and verified to the same standard.

**Status: the core is done and vector-complete. Nothing is wired to it yet.**

| Piece | Where | State |
|---|---|---|
| `I8086` core | `bw-board/src/i8086.js` | **646,000/646,000 vectors, 323/323 files** |
| Vector grinder | `bw-board/scripts/grind-i8086.mjs` | green, ~60 s for the full suite |
| Always-on subset | `bw-board/test/i8086.test.mjs` | 14 tests, green |
| Disassembler | `i8086-disasm.js` | not started |
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

## 5. Next: the debugger tier

In order, each landing green before the next starts.

**M2 — `i8086-disasm.js`.** Reads through the bus like `z80-disasm.js`, takes a
*linear* address, returns text plus length. The ModR/M and prefix decode is
already written and proven inside the core; the disassembler needs its own copy
of it because it must not advance IP.

**M3 — `i8086-machine.js` + `i8086-adapter.js`.** The composable machine in the
`m6502-machine.js` shape: `{clockHz, regions, chips}`, RAM/ROM ranges over a
20-bit space, peripherals advanced by each instruction's cycle count, pin-level
effects crossing the boundary in the same `{tMs, pin, level}` shape everything
else emits. This is also where INTR/NMI delivery lands, with the IF check and
the one-instruction inhibition after a segment-register load.

**M4 — `i8086-debug.js`.** Boundary-D target mirroring `z80-debug.js`:
`capabilities`, `state`, `regs`, `disasm`, `onHalt`, `setBreakpoint`,
`clearBreakpoint`, `run`, `halt`, `step`. Decisions already forced by the
architecture:

- `regs()` returns `ax…dx, cs, ip, ss, sp, ds, es, bp, si, di, flags` plus a
  derived `pc`.
- **Code breakpoints compare on the linear address.** Two different `seg:off`
  pairs can name the same instruction; only the linear compare cannot be
  fooled. The UI may accept `1234:5678` and convert.
- Write watchpoints wrap `cpu.write` exactly as the Z80 target does — the same
  pattern, with the mask widened to `0xfffff`.
- Step-over needs its own call-class test: `E8`, `9A`, `CD`, `CC`, and `FF`
  reg 2/3.

**M5 — the teaching surface.** Which machine the lessons actually run: a bare
8086 on the breadboard, or a minimal XT-alike. Not decided, and not blocking
M2–M4.

## 6. Why the core is not vendored into Lite yet

`i8086.js` lives in `bw-board`, which is where `z80.js` and `w65c02.js` live and
where `npm run sync:bwboard` pulls from. Vendoring it into the overlay before
the adapter and debug target exist would land a module that nothing imports —
which is exactly what `test/no-dead-overlay-modules.test.mjs` exists to catch,
and it would be right to. The core rides in with M3.
