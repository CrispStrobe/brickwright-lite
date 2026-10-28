# Kaluma (JavaScript) on the emulated Pico

**Status: it boots and runs JavaScript live — but the first GPIO call hangs.**
Kaluma 1.2.1 for the Raspberry Pi Pico (RP2040) runs unmodified inside rp2040js
behind this repo's clean-room boot ROM, enumerates as a USB CDC device, reaches
its REPL, and evaluates `1+1` to `2` over the exact transport
`overlay/scratch-gui/src/lib/pico-repl.js` speaks. **`pinMode(25, OUTPUT)` then
busy-loops forever**, so a blink never lights. The cause (finding N5-1, §2) is
precise: Kaluma routes JavaScript numbers through the RP2040 bootrom's
single-precision soft-float table `'SF'`, which this clean-room boot ROM leaves
empty — so `rom_data_lookup('SF')` returns `0`, and the first number `pinMode`
converts calls a null-derived pointer into a spin. `2.5+1.0` evaluates to `0`
instead of `3.5`, which shows the same broken soft-float from the REPL in one
keystroke. It is the same class as the MicroPython flash-filesystem gap
(`docs/PICO-MICROPYTHON-BOOT.md` §4) — a clean-room boot ROM that answers only
what MicroPython needs — but a bigger fix, because `'SF'` must be a real jump
table, not a stub.

This is the **investigation half** of plan N5. No product code, no matrix
change: the JS·Pico cell stays as it is until the boot ROM answers what Kaluma
asks. §4 is the recommendation; §5 is the micro:bit PXT half, costed not
measured.

Reproduce everything below with:

```
node scripts/probe-pico-kaluma.mjs --eval     # boot + prove live JS (1+1 -> 2)
node scripts/probe-pico-kaluma.mjs --blink     # + the pinMode busy-loop
```

The probe reuses the MicroPython probe's boot harness verbatim
(`createPicoMachine`, `parseUF2`) and resolves `rp2040js` from the integrated
tree (`packages/scratch-gui`, or `BW_INTEGRATED_ROOT`). It fetches
`kaluma-rp2-pico-1.2.1.uf2` once into `artifacts/pico-kaluma/` (gitignored) and
refuses to cache it unless the sha256 is `74fde251…e15ea`. Kaluma is Apache-2.0;
the ~1 MB binary is still not committed, same trade as the MicroPython probe.

**Why 1.2.1 and not the latest.** Kaluma 1.3.0 (Oct 2025) dropped the original
Pico and ships only `pico2` (RP2350) images. rp2040js emulates the RP2040, so
1.2.1 — the newest release that still carries `kaluma-rp2-pico-<ver>.uf2` — is
the pinned target.

---

## 1. What actually happens on a good boot

Entry at `0x10000000`, SP `0x20042000` — exactly where the real boot ROM leaves
the core, with boot stage 2 running first (which is what writes
`M0PLUS_VTOR`; the same entry discipline the MicroPython investigation
established). Kaluma then relocates VTOR to the RAM vector table at
`0x20000000`, like MicroPython.

| milestone | instruction |
|---|---|
| USB CDC device enumerated, DTR set | 946,123 |
| Kaluma REPL `>` prompt returned after a bare newline | 1,175,086 |
| `1+1` evaluated to `2` over pico-repl.js's transport | a few M later |

Sim time to the prompt is **15.8 ms**; wall time on this box is **~0.6 s**. USB
CDC enumerates and the prompt answers, so the boot itself is as healthy as
MicroPython's.

### The REPL needs one thing MicroPython's did not: a DSR answer

Kaluma's REPL is a full ANSI **line editor**. On every line it emits a
cursor-position query — `ESC [ 6 n` (DSR) — and **blocks until the terminal
answers** with a position report (`ESC [ row ; col R`). A dumb pipe never
answers, so the editor stalls: the line is echoed but never evaluated. (The
first probe saw exactly this — the blink line came back echoed, with no result
and no new prompt.)

The seam therefore has to answer the DSR. `pico-repl.js`'s transport is a plain
byte read/write, so the probe wraps it: whenever `ESC [ 6 n` appears, it writes
back `ESC [ 1 ; 1 R`, and the editor proceeds. With that one addition, `\r`
submits and evaluates:

```
1+1            -> 2
typeof pinMode -> 'function'      typeof digitalWrite -> 'function'
typeof HIGH    -> 'number'        typeof OUTPUT       -> 'number'
board.LED      -> 25
```

So **pure-JavaScript run-live works through the existing transport** — the same
`pico-repl.js` the Pico ▶ Run uses for MicroPython, plus a DSR responder. There
is no banner to gate on (same lesson as MicroPython: it is written before the
host enumerates, into a closed pipe).

---

## 2. Where it stops: `pinMode` busy-loops in the boot ROM

Kaluma is Arduino-flavoured, so a blink is `pinMode(25, OUTPUT);
digitalWrite(25, HIGH);` and GP25 is the onboard LED (`board.LED === 25`,
confirmed above). Sent to the live REPL, it **never returns**:

```
after pinMode(25, OUTPUT):  148,500,000 instructions, 0.000 ms WFE, GP25 = Input
```

148 million instructions with **zero** time in WFE is a genuine busy loop, not a
device asleep waiting for an interrupt (the distinction the MicroPython probe's
`idleNanos` accounting exists to make). GP25 is never driven — the pin stays
`Input`, output-enable false.

### The loop, named

The hot PCs are almost entirely the boot ROM's `rom_table_lookup` routine at
`0x100`:

```
0x100  ldrh r2, [r0]       ; read a table entry (code)
0x102  cmp  r2, #0         ; zero code => end of table
0x104  beq  0x10e          ; -> return 0 (not found)
0x106  cmp  r2, r1         ; match the requested code?
0x108  beq  0x112          ; -> return the value
0x10a  adds r0, #4         ; next entry
0x10c  b    0x100
```

But the loop is driven from **outside**: the caller at `LR = 0x1000463f`
(Kaluma / pico-sdk flash code) calls `rom_table_lookup` over and over, each time
with the table pointer advanced by four:

```
code r1 = 0x04800000   table r0 = 0x00480014   LR 0x1000463f
code r1 = 0x04800000   table r0 = 0x00480018   LR 0x1000463f
code r1 = 0x04800000   table r0 = 0x0048001c   LR 0x1000463f
…                       0x00480020, 0x00480024, 0x00480028, …  (unbounded)
```

Both arguments are garbage. A real lookup passes the ROM function table
(`~0xd0` on this boot ROM) as `r0` and a **two-character** code (`≤ 0xFFFF`) as
`r1`; here `r1 = 0x04800000` can never match a 16-bit table entry, and
`r0 = 0x00480014` points into the unmapped `0x00480000` region and marches
upward forever.

### Finding N5-1: the null soft-float table (`'SF'`), named

**The two-character ROM code is `'SF'` (0x4653) — the RP2040 bootrom's
single-precision soft-float function table (datasheet §2.8.3.1.2), looked up as
ROM _data_, not a ROM function.** This clean-room boot ROM's data table is
deliberately empty, so the lookup returns `0`, and the null propagates into a
soft-float function pointer that `pinMode` calls.

Reproduce:

```
node scripts/probe-pico-kaluma.mjs --eval     # 1+1 -> 2, but 2.5+1.0 -> 0
node scripts/probe-pico-kaluma.mjs --blink     # pinMode hangs
```

**The lookup, measured.** Instrumenting `rom_table_lookup` (0x100) over the
whole boot records exactly **one** data-table lookup — everything else is the
function table (`'IF'`, `'EX'`, `'FC'`, the flash codes):

```
rom_table_lookup(table = 0x0000020c, code = 0x4653 'SF')   @ instruction 155,382
```

`0x20c` is this boot ROM's data-table pointer (the `u16` at header offset
`0x16`). And that table is a single zero word — empty by construction, with the
reason stated in the source
(`overlay/scratch-gui/src/lib/bw-board/rp2040-bootrom.js`):

```js
const dataTable = at + 4;
// Empty, and deliberately so. The one data entry a firmware asks for
// is 'SF', mufplib's jump table, and answering it with a pointer to
// zeros would turn a clean lookup miss into a jump to address 0.
// Measured: answering it moves the panic by TWO steps, so the float
// table is not what stops MicroPython here.
view.setUint32(dataTable, 0, true);
```

So `rom_data_lookup('SF')` returns `0`. That is correct *for MicroPython*, which
does not use the ROM soft-float — but **Kaluma does**, and the empty table is
exactly what stops it.

**The null, cached and called.** pico-sdk's ROM-backed soft-float (`pico_float`)
resolves each single-precision operator's function pointer from that table base
and caches them in RAM. With the base `0`, the cache fills with tiny bogus
addresses. Measured, at the veneer that dispatches the operation:

```
*(0x10020778) = 0x2003163c          ; the RAM soft-float function-pointer cache
*(0x2003163c) = 0x00000143          ; the cached operator pointer — bogus (thumb 0x142)
```

`0x142` is not a soft-float routine; it is the middle of an unrelated clean-room
boot-ROM routine (`… 0x142: movs r2,#0 / cmp r0,#0 / beq …`). The call site is a
plain indirect call — **the null-derived pointer is loaded into `r3` and invoked
by `blx r3` at `0x10020760`**:

```
10020758  ...
1002075c  ldr  r3, [pc, #24]     ; r3 = *(0x10020778) = 0x2003163c
1002075e  ldr  r3, [r3, #0]      ; r3 = *(0x2003163c) = 0x00000143  (the null-derived pointer)
10020760  blx  r3                ; call into the middle of the boot ROM
```

`blx`-ing into `0x142` runs boot-ROM code with garbage registers, which is how
the observed loop above ends up re-entering `rom_table_lookup` with the bogus
`table = 0x00480014…`, `code = 0x04800000` arguments — a *downstream* symptom of
the one null lookup, not a second cause.

**Which operation, and why `pinMode` specifically.** `pinMode(25, OUTPUT)`
converts its numeric argument — a JerryScript `Number` — through the ROM
soft-float on its way to an integer pin index, and that operator is one whose
bogus pointer loops. Pure integer arithmetic never touches soft-float, so it is
unaffected; a float operation is corrupted but does not always loop. All three
are visible from the REPL, no disassembler required:

```
1+1      -> 2       (integer fast path, correct)
40+2     -> 42      (integer fast path, correct)
2.5+1.0  -> 0       (soft-float — WRONG, should be 3.5: the SF table is null)
```

The `2.5+1.0 -> 0` line is the whole finding in one keystroke: the ROM
soft-float is broken, and `pinMode` is the first thing that routes a number
through it in a way that hangs.

This is the **same class** as the MicroPython flash-functions gap
(`PICO-MICROPYTHON-BOOT.md` §4) — a clean-room boot ROM that answers only what
MicroPython needs — but it is the `'SF'` **data** entry, and the fix is a bigger
lift than the flash `bx lr` stubs: a real single-precision soft-float jump
table (mufplib-equivalent, clean-room) has to be provided, or the empty table
replaced with one whose entries fail *safely* rather than into a spin. It is a
boot-ROM completeness problem, not a Kaluma bug (Kaluma runs on real Picos,
whose boot ROM has `'SF'`) and not an rp2040js bug (CPU, GPIO and CDC are all
modelled correctly — integer JS and USB work).

---

## 3. Licence ledger

Kaluma's own runtime is **Apache-2.0** (`LICENSE` in `kaluma-project/kaluma`).
The RP2040 image links these third parties, each pinned as a git submodule
(`.gitmodules`) or vendored under `lib/`; licences verified against the
authoritative upstream repositories:

| component | role in the Pico build | licence | shipping obligation |
|---|---|---|---|
| Kaluma | runtime, REPL, JS host API | Apache-2.0 | NOTICE + licence text |
| JerryScript (`kaluma-project/jerryscript`) | the JavaScript engine | Apache-2.0 | NOTICE + licence text |
| pico-sdk (`raspberrypi/pico-sdk`) | RP2040 HAL, USB, runtime | BSD-3-Clause | attribution |
| TinyUSB (via pico-sdk) | USB CDC device stack | MIT | attribution |
| CMSIS (via pico-sdk) | Cortex-M0+ core headers | Apache-2.0 | NOTICE + licence text |
| littlefs (`littlefs-project/littlefs`) | flash filesystem | BSD-3-Clause | attribution |

**Every component is permissive — Apache-2.0 / BSD-3-Clause / MIT — with no
copyleft**, so the UF2 is inside this repo's stated
BSD-3-Clause / Apache-2.0 / MIT regime and could be redistributed. Doing so
would require carrying the Apache-2.0 `NOTICE` files (Kaluma, JerryScript,
CMSIS) and the BSD/MIT attribution notices alongside the binary — the same
notice discipline `scripts/gen-rust-notices.mjs` already applies to vendored
artefacts. (The `pico-w`-only extras — `dhcpserver` and the STM32 HAL trees in
Kaluma's `lib/` — are not linked into the plain `rp2-pico` target and do not
enter the ledger.) Since the emulator answer is "not yet" (§2), no UF2 ships
today, so the notice work is deferred with the feature.

---

## 4. Recommendation

**Native JavaScript on the Pico via Kaluma is buildable through the existing
seam — but it is blocked, today, by a boot-ROM gap, not by anything in the app.**

What already works, measured: Kaluma boots in rp2040js behind this repo's boot
ROM, enumerates USB CDC, reaches its REPL, and evaluates JavaScript live over
the same `pico-repl.js` transport the Pico ▶ Run uses for MicroPython — the only
new host-side requirement is answering the REPL's `ESC[6n` cursor query. A JS
cell would reuse the N3c run-live path almost unchanged.

What blocks it (§2, finding N5-1): Kaluma routes JavaScript numbers through the
RP2040 bootrom's soft-float table, which this clean-room boot ROM leaves empty
on purpose, so `rom_data_lookup('SF')` returns `0`, the SDK caches a null-derived
operator pointer, and the first number `pinMode` converts calls it — into a spin.
The fix is in bw-board's `src/rp2040-bootrom.js` (whence it syncs into
`overlay/scratch-gui/src/lib/bw-board/`), and it is a **bigger** lift than the
MicroPython flash-function `bx lr` stubs: the empty `'SF'` data entry has to
become a real single-precision soft-float jump table (a clean-room mufplib
equivalent), because Kaluma actually calls the routines it points at — an empty
or zero-filled table only moves the crash.

So: **do not flip the JS·Pico matrix cell yet.** N5-1 above is the finding to
hand to bw-board; the follow-up, effort-ordered: (1) **done — N5-1**: the ROM
code is `'SF'`, the SDK path is `pico_float`'s ROM soft-float, the null is
called via `blx r3` at `0x10020760`; (2) in bw-board's `rp2040-bootrom.js`,
provide a clean-room single-precision soft-float jump table for `'SF'` (at
minimum the operators Kaluma's number path uses); (3) re-run
`node scripts/probe-pico-kaluma.mjs --blink` and confirm GP25 goes high (and
`--eval` shows `2.5+1.0 -> 3.5`); (4) only then flip the cell in a lane shaped
exactly like N3c — a `js`/`kaluma` artefact, the run-live seam wired to the
DSR-answering transport, and a browser gate. Until (2) lands, Kaluma is an
*integer* JavaScript calculator on the emulated Pico: it computes with whole
numbers, gets floats wrong, and cannot blink.

---

## 5. The micro:bit half (PXT static TypeScript, hosted) — costed, not measured

The plan's second question is whether MakeCode's compiler is reachable from the
MakeCode path already in the tree. **It is not, and the distinction is the whole
cost.** `overlay/scratch-gui/src/lib/bw-makecode/` is an **importer**: `ts-import.js`
+ `embedded-source.js` recover a MakeCode project's `main.ts` (Static
TypeScript) from a `.hex`/`.uf2`/`.png` and translate that limited subset into
BrickWright pseudocode, which the rest of the app already runs. It is a one-way
*reader* of MakeCode output; nothing in it invokes a compiler.

Producing a micro:bit binary from TypeScript is the reverse direction and a
different machine entirely: PXT parses Static TypeScript, lowers it through its
own IR, and links against the micro:bit's **CODAL** C++ runtime with a real ARM
toolchain to emit a CODAL `.hex`. Two ways to reach it, both non-trivial:

- **Hosted** — POST the source to the MakeCode compile service
  (`makecode.microbit.org` / `pxt.io`). Cheapest to wire (it mirrors how the
  8086 hosted path already calls out), but it makes the JS·micro:bit cell depend
  on a network service outside this repo's control and outside the offline,
  bundle-and-ship promise the project is built on — so it would ship as an
  explicitly *hosted, tier-declared* cell, never a local one.
- **Vendored** — bring PXT + the micro:bit target + CODAL + an ARM toolchain
  in-tree. Fully offline and faithful, but it is a large, GPL-adjacent
  dependency graph that needs the same licence audit §3 did for Kaluma before a
  single file is adopted (CODAL is MIT; PXT is MIT; the toolchain is the
  question), and it is a far bigger lift than the Kaluma boot-ROM fix.

Recommendation for the micro:bit half: **defer**. Kaluma on the Pico is one
boot-ROM entry away from a genuine native-JS device story; the micro:bit PXT
path is a service integration or a toolchain adoption, and neither is measured
here because neither is reachable from the importer that exists today.
