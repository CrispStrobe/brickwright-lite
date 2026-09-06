# Kaluma (JavaScript) on the emulated Pico

**Status: it boots and runs JavaScript live — but the first GPIO call hangs.**
Kaluma 1.2.1 for the Raspberry Pi Pico (RP2040) runs unmodified inside rp2040js
behind this repo's clean-room boot ROM, enumerates as a USB CDC device, reaches
its REPL, and evaluates `1+1` to `2` over the exact transport
`overlay/scratch-gui/src/lib/pico-repl.js` speaks. **`pinMode(25, OUTPUT)` then
busy-loops forever** in the boot ROM's `rom_table_lookup`, so a blink never
lights. The cause is the same clean-room boot-ROM gap that stops MicroPython's
flash filesystem (`docs/PICO-MICROPYTHON-BOOT.md` §4) — a different missing ROM
entry, the same shape of failure.

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

### Root cause: the same boot-ROM gap as MicroPython §4

The `0x00480000` pointer is not random — it is a **null/incomplete ROM lookup
used as a base address**. This repo's boot ROM
(`overlay/scratch-gui/src/lib/bw-board/rp2040-bootrom.js`) is clean-room and
implements only the subset of ROM function/data-table entries MicroPython's
boot exercises. `rom_table_lookup` returns `0` on a miss, and — exactly as the
MicroPython investigation found for the flash functions — **the SDK uses the
result without a null check**. Kaluma's RP2040 startup asks the ROM for
something the clean-room table does not answer, gets `0`, computes the
`0x00480000`-region base from it, and then scans that base for a code that
cannot exist. The register file at the hang:

```
r0 = 0x005f0f20 (marching table ptr)   r1 = 0x04800000 (bogus code)
r2 = 0x0000ffff   r3 = 0x00000000   r4 = 0x00000400   r5 = 0x1c800000
LR = 0x1000463f   PC = 0x00000100..0x0000010c (rom_table_lookup)
```

This is a **boot-ROM completeness** problem, not a Kaluma bug (Kaluma runs on
real Picos, whose boot ROM is complete) and not an rp2040js bug (the CPU, GPIO,
and CDC are all modelled correctly — pure JS and USB work). The specific ROM
code Kaluma's `gpio`/runtime path requests is not yet pinned; naming it needs a
disassembly of Kaluma's SDK build around `0x1000463f`, and is the first task of
any follow-up (§4).

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

What blocks it: any call that touches hardware — starting with `pinMode` — hangs
in the clean-room boot ROM's `rom_table_lookup`, because the ROM does not
implement the entry Kaluma's RP2040 startup asks for and the SDK dereferences
the `0` it gets back. This is the identical class of defect the MicroPython
investigation fixed for the flash functions, and it wants the identical fix, in
the identical place: **add the missing entries to bw-board's
`src/rp2040-bootrom.js`**, from where they sync into
`overlay/scratch-gui/src/lib/bw-board/`.

So: **do not flip the JS·Pico matrix cell yet.** The follow-up, effort-ordered:
(1) disassemble Kaluma's SDK around `0x1000463f` to name the exact ROM code it
looks up during `gpio_init`; (2) add that entry (and any siblings the rest of
the HAL needs) to the clean-room boot ROM in bw-board; (3) re-run
`node scripts/probe-pico-kaluma.mjs --blink` and confirm GP25 goes high; (4)
only then flip the cell in a lane shaped exactly like N3c — a `js`/`kaluma`
artefact, the run-live seam wired to the DSR-answering transport, and a browser
gate. Until (2) lands, Kaluma is a JavaScript calculator on the emulated Pico:
it computes, but it cannot blink.

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
