# MakeCode interop — what we can cover, and what it costs

The question that started this: *can we support .hex files from MakeCode
Arcade in our micro:bit emulator, and what else from MakeCode Arcade can we
cover?*

We do **not execute the foreign machine code**. We recover its embedded source,
translate the game model to ordinary Scratch sprites and run that project on a
real 160x120 console surface. The distinction matters: imported games play,
but unsupported engine features are reported instead of being emulated badly.

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
| `ts-import.js` | a parser for the TypeScript subset MakeCode emits (annotations, `enum`, `namespace`, tagged template literals, function expressions) — needed because the translation has to walk *into* callbacks |
| `translate-base.js` | what both translators share: the walk, the "nothing is dropped in silence" rule, and the slot discipline |
| `microbit-translate.js` | MakeCode micro:bit → BrickWright pseudocode → blocks, MicroPython, the simulator |
| `arcade-translate.js` | MakeCode Arcade → a playable Scratch project: target selection, sprites, clones, `touching`, score, velocity loops |
| `arcade-assets.js` | the artwork: `img` literals, the `.g.jres` gallery (column-major 4bpp), the 16-colour palette → SVG costumes |
| `export.js` | the other direction: blocks → MakeCode TypeScript, and a .hex carrying only the source embed — which is all MakeCode's importer reads |
| `index.js` | one `importArtefact(bytes)` door, wired into the Code tab's 📂 Open button |

Evidence: `test/makecode-import.test.mjs` runs against **three real MakeCode
downloads** (see `test/fixtures/makecode/README.md`) plus round-trips for the
two containers we have no committed sample of.

### What actually runs

A **MicroPython .hex** needs no translation at all: our simulator *is* a
MicroPython interpreter, so the extracted `main.py` can be flashed straight
into it. That is the cheapest win in the whole story and it is why
`micropython-hex.js` exists next to the MakeCode reader rather than somewhere
else.

A translated **MakeCode Arcade** game also runs. `DEVICE ARCADE` selects the
game-console pane; its 160x120 viewport mirrors the Scratch renderer and its
eight controls post through Scratch keyboard IO. The same state backs the
Arcade extension's buttons, light, tilt, score and PyBadge NeoPixels. This is
a source-level port, not binary emulation, which is why tilemaps and other
unsupported APIs remain visible in the import report.

## The ladder, and where we are on it

| | what | state |
|---|---|---|
| 0 | sniff + extract project source from .hex/.uf2/.elf/.png | **done** |
| 0b | MicroPython .hex → `.py` → runs in the simulator | **done** (extraction; the "flash it into the sim" button is next) |
| 1 | MakeCode **micro:bit** TypeScript → our blocks | **done** |
| 2 | MakeCode **Arcade** → a Scratch project, artwork included | **done** |
| 3 | import from a share link (needs network; the file importer is what works offline and in the packaged app) | **done** — 🔗 MakeCode… in the Code tab |
| 4 | export: a Brickwright project opens *in* MakeCode | **done** — ⬆ To MakeCode writes a .hex whose only content is the source embed, which is what MakeCode's importer actually reads |
| 4b | export: compile a modified project to a board `.uf2` | **not done**, and not the same thing — that needs pxt's own compiler. Opening in MakeCode is not physical deployment |
| 5 | actually emulate a MakeCode hex | see below |

## What the grammar will and will not take

Most of what the translators know is not about MakeCode at all — it is
about which pseudocode spellings actually parse. Three slots behave
differently, and every one of them was found by compiling the output
rather than by reading the grammar:

- **single-token** (`radio send number X`, `change score by X`, `set pin
  P1 analog X %`): captured as `\S+`, so a variable fits and `i * 30`
  does not. Computed arguments are hoisted into a temporary.
- **literal-only** (`show text "..."`, `plot x 2 y 3`): the parser reads
  the characters. `show text <expression>` PARSES and compiles to
  nothing — so `basic.showNumber(x)` uses `display <expr>` instead,
  which does take an expression, and `led.plot(x, y)` with variables is
  refused.
- **condition-lowered** (`set pin P0 to 0|1`): only the two literals
  parse, so a computed level becomes the IF/ELSE it really is.

Two spellings sb3-creator's *generator* emits have no rule in its
*parser*: `<gesture> happening` and `pin P touched`. Written out they
compile to a comparison against an undefined variable — silence with the
shape of success. The translator reports them instead. **Closing that
round-trip belongs in `sb3-creator`, not here** (the compiler is
vendored in by `npm run sync:sb3creator`), and it would also be the
place to let `show text` take an expression.

## What an Arcade import actually produces

`sprites.create` → a sprite with the real artwork as its costume;
`img` literals and `.g.jres` entries both. `game.onUpdate` → `WHEN flag
clicked` + `FOREVER`. `sprites.onOverlap` → `IF touching <other>`.
`controller.moveSprite` → arrow keys. `info.changeScoreBy` → a `score`
variable. `sprite.vx/vy` → a per-frame motion loop. A mid-game
`sprites.create` → `create clone of <sprite>`, emitted *after* the
positioning that precedes it, because a Scratch clone inherits the
parent's state at the moment it is made. `scene.setBackgroundImage` → a
full-screen sprite sent to the back (the costume route deliberately
skips the Stage).

What does not survive: tilemaps, effects and particles, the physics
engine's tile collisions, animations, music — and, structurally, any
script that moves a sprite other than its own, which Scratch has no way
to express. Each is named in the returned `unsupported` list and marked
`# unsupported` where it stood, and the status line says how many.

## The round trip is the test

`test/makecode-export.test.mjs` takes each shipped micro:bit example,
exports it to MakeCode TypeScript, imports it back through the
translator, compiles that, and asserts no device block was lost. Six
examples pass with nothing unsupported in either direction. A mapping
added to one side of the table and forgotten on the other shows up there
and nowhere else.

The one legitimate difference: `show text` leaves as `basic.showString`
and comes back as `scroll text`, because MakeCode has no non-scrolling
string block.

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

## Two things found on the way that are not built here

**The pxteditor iframe protocol.** MakeCode editors accept
`?controller=1` and then talk `postMessage` in a documented shape
(`{type: "pxteditor", action: "renderblocks" | "importproject" | …}`,
answered with `{type: "pxthost"}`). That is how you would embed the real
editor, or render a block image of a snippet, without any of the parsing
above. It needs the network and a remote origin, which is exactly what
this fork exists to avoid — but it is the right tool if we ever want
"edit this in MakeCode, come back with the result".

**The Arcade block vocabulary as an extension.** We ship a 5x5 `arcade`
extension (sprites on the LED matrix). Growing it into a stage-backed
sprite/tilemap/scene extension would let people *write* Arcade-shaped
programs here, which is the mirror of importing them. Separate feature,
not interop.

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
