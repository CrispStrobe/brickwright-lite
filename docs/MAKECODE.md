# MakeCode interop — what we can cover, and what it costs

The question that started this: *can we support .hex files from MakeCode
Arcade in our micro:bit emulator, and what else from MakeCode Arcade can we
cover?*

The short answer to the first half is **not by executing them** — and the
reason is structural, not a missing feature. The long answer is that the .hex
is not opaque at all, and almost everything worth having is reachable by
reading it rather than running it.

## Why an Arcade .hex cannot run on our micro:bit simulator

Three independent walls. Any one of them is fatal on its own.

1. **Our simulator is not a CPU emulator.** `static/microbit-sim/` is the
   micro:bit Foundation's MicroPython simulator compiled to WASM, driven from
   `microbit-sim-pane.jsx` by a `{kind:'flash', filesystem}` message carrying
   **`.py` files**. It interprets Python. There is no address space to put ARM
   machine code into.
2. **Wrong instruction set.** MakeCode Arcade's micro:bit build targets V2 =
   nRF52833, Cortex-M4 (ARMv7E-M). Our in-tree ARM core is rp2040js's
   `CortexM0Core`, wrapped by `bw-board/cortex-m0-machine.js` — ARMv6-M. It
   cannot decode M4 encodings. (See "The labwired revision" below: this wall
   is the one that moved.)
3. **Wrong I/O surface.** The arcade shield is a 128x160 ST7735/ILI9163C over
   SPI; our micro:bit face draws 5x5 LEDs. A working CPU would produce a black
   screen until an ST7735 model, the SPI block, the timers and the display
   driver's DMA behaviour all existed.

## What the .hex does give us — and this part is built

MakeCode embeds the project **source** in everything it downloads. So
importing someone's game is a parsing problem, and parsing problems end.

Implemented in `overlay/scratch-gui/src/lib/bw-makecode/`:

| module | what it does |
|---|---|
| `embedded-source.js` | the container: finds the `41 14 0E 2F B8 2F A2 BB` header in a .hex (universal hexes included), a .uf2, an .elf or a .png cartridge, and returns `{meta, source, files}` |
| `lzma.js` | an LZMA1 decoder, because the embedded text is LZMA and every JS implementation available to depend on is unlicensed or a compressor we would never call |
| `png.js` | an 8-bit PNG decoder over `DecompressionStream`, so the cartridge path is testable in `node --test` rather than only in a browser |
| `micropython-hex.js` | the *other* hex: a micro:bit MicroPython .hex from python.microbit.org or uflash, V1 appended script and V2 filesystem both |
| `share.js` | `https://makecode.com/api/{id}/text` — the whole project as JSON, no binary parsing at all |
| `index.js` | one `importArtefact(bytes)` door, wired into the Code tab's 📂 Open button |

Evidence: `test/makecode-import.test.mjs` runs against **three real MakeCode
downloads** (see `test/fixtures/makecode/README.md`) plus round-trips for the
two containers we have no committed sample of.

### The one that actually runs

A **MicroPython .hex** needs no translation at all: our simulator *is* a
MicroPython interpreter, so the extracted `main.py` can be flashed straight
into it. That is the cheapest win in the whole story and it is why
`micropython-hex.js` exists next to the MakeCode reader rather than somewhere
else.

## The ladder, and where we are on it

| | what | state |
|---|---|---|
| 0 | sniff + extract project source from .hex/.uf2/.elf/.png | **done** |
| 0b | MicroPython .hex → `.py` → runs in the simulator | **done** (extraction; the "flash it into the sim" button is next) |
| 1 | MakeCode **micro:bit** TypeScript → our blocks. `sb3-creator-javascript.js` is already a JS parser→pseudocode importer; this is a TS pre-pass (strip annotations, `enum`/`namespace`, `img\`\`` literals) plus an API map for `basic.*`, `input.*`, `led.*`, `music.*`, `pins.*`, `radio.*` | next |
| 2 | MakeCode **Arcade** → a Scratch project. Arcade's model (sprite = image + vx/vy, `sprites.onOverlap`, tilemap, `info.score`, `game.over()`) is close to 1:1 with the Scratch stage. Plus assets: `img\`\`` literals and the fixed 16-colour palette → costumes; tilemaps → backdrops | planned |
| 3 | import from a share link (needs network; the file importer is what works offline and in the packaged app) | **done** (`share.js`) |
| 4 | export: emit `main.ts` + `pxt.json` so a Brickwright project opens *in* MakeCode | planned |
| 5 | actually emulate a MakeCode hex | see below |

## The labwired revision

The claim in wall 2 — "no permissive JS ARMv7E-M core" — was true of this
repo's *light* tier and is no longer true of its heavy tier. **labwired**
(`lib/labwired-engine.js`, fetched by `npm run sync:labwiredwasm`) covers
Cortex-M0+/M3/**M4**/M7/M33, RISC-V and Xtensa. That makes nRF52833 execution
a **peripheral-modelling** problem rather than an instruction-set one:

- what would still be needed: nRF52 GPIO/GPIOTE, TIMER/RTC, SPIM, and an
  ST7735 model with a framebuffer the stage can show;
- what it would buy: running an unmodified Arcade game — someone else's
  binary — with no translation;
- what it would not buy: any of the *editing* story. A running binary is not
  a project you can open, read or change, which is what the import path gives.

So the order stands: import first, emulate later, and only if the demand is
for playing other people's games rather than learning from them. The two are
complementary, not alternatives — and neither needs the other to ship.

## Licensing (this matters more here than elsewhere)

Checked via the GitHub API on 2026-08-27:

- `microsoft/pxt`, `microsoft/pxt-arcade`, `microsoft/pxt-common-packages` —
  **MIT**. Format details and even runtime pieces are compatible with lite's
  fully-permissive rule.
- `microsoft/pxt-microbit` — **NOASSERTION**. Read its `LICENSE.txt` before
  taking anything from it.
- `microbit-foundation/microbit-fs`, `microbit-universal-hex` — **MIT** (the
  V1/V2 storage formats implemented in `micropython-hex.js` are documented
  there).
- `maehw/microbit-pxt-code-extractor` — **GPL**. Do not read or borrow from
  it; the format is documented publicly at <https://makecode.com/source-embedding>
  and that is what this implementation follows.
- The LZMA decoder is written from the specification. The LZMA SDK the
  algorithm comes from is public domain.
