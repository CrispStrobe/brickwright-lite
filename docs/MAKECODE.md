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
| `arcade-assets.js` | the artwork: `img` literals, the `.g.jres` gallery (column-major 4bpp), tilemaps painted whole, the 16-colour palette → SVG costumes |
| `microbit-icons.js` | MakeCode's 40 icons and 8 arrows as our 5x5 patterns — the same bitmaps MicroPython has, so this is an identity |
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
| 0b | MicroPython .hex → `.py` → runs in the simulator | **done**, end to end: the extracted script lands in the micro:bit tab (which appears whenever there IS MicroPython to show, not only when a DEVICE line says so) and that tab's **▶ Run on simulator** flashes it |
| 1 | MakeCode **micro:bit** TypeScript → our blocks | **done** |
| 2 | MakeCode **Arcade** → a Scratch project, artwork included | **done** |
| 3 | import from a share link (needs network; the file importer is what works offline and in the packaged app) | **done** — 🔗 MakeCode… in the Code tab |
| 4 | export: a Brickwright project opens *in* MakeCode | **done** — ⬆ To MakeCode writes a .hex whose only content is the source embed, which is what MakeCode's importer actually reads |
| 4b | export: compile a modified project to a board `.uf2` | **not done**, and not the same thing — that needs pxt's own compiler. Opening in MakeCode is not physical deployment |
| 5 | actually emulate a MakeCode hex | see below |
| 6 | **Calliope mini** (`makecode.calliope.cc`) | **not done, and not attempted blind.** The target is already recognised, but such a project currently lands in the JavaScript tab. Its core API is micro:bit's, so routing it through that translator would mostly work — with the Calliope-only calls (RGB LED, motors) refused, and `DEVICE MICROBIT` being an approximation of the board. Worth doing the moment one real `.hex` from that editor exists to test against; everything else here was built against real downloads and this should be too |

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

Two spellings sb3-creator's *generator* emitted had no rule in its
*parser*: `<gesture> happening` and `pin P touched`. Written out they
compiled to a comparison against an undefined variable — silence with
the shape of success — so the translator refused them.

**Fixed upstream and vendored in** (sb3-creator `b4a8129`, PR #3): both
now parse, `show text` takes an expression, and the translator
translates gestures and touch instead of reporting them.

That PR also fixed something worse, found on the way: MicroPython's
`accelerometer.is_gesture()` accepts the four tilts spelled WITHOUT the
word "tilt", and the lowering passed the menu label through verbatim —
so `tilt up` and its three neighbours raised
`ValueError("invalid gesture")` the moment the block ran. Every project
that used one, not only imported ones.

## What an Arcade import actually produces

`sprites.create` → a sprite with the real artwork as its costume;
`img` literals and `.g.jres` entries both. `game.onUpdate` → `WHEN flag
clicked` + `FOREVER`. `sprites.onOverlap` → `IF touching <other>`.
`controller.moveSprite` → arrow keys. `info.changeScoreBy` → a `score`
variable, and the per-player API (`info.player2.hasLife()`,
`onLifeZero`) → `score2`/`lives2` — player one shares the plain API's
variables, because in MakeCode the plain API *is* player one and a game
that mixes both would otherwise keep two scores that drift apart. `sprite.vx/vy` → a per-frame motion loop. A mid-game
`sprites.create` → `create clone of <sprite>`, emitted *after* the
positioning that precedes it, because a Scratch clone inherits the
parent's state at the moment it is made. `scene.setBackgroundImage` → a
full-screen sprite sent to the back (the costume route deliberately
skips the Stage).

Tilemaps arrive as pictures: the level is painted tile by tile into one
image and becomes a backdrop costume (the tiles live in the `.g.jres`,
but the MAP is a hex literal inside a generated `switch` in
`tilemap.g.ts`, so it has its own reader). A game with several levels
gets the first four as costumes on one background sprite — a level
renders to a few hundred kilobytes of SVG, and handing the paint editor
eight of those helps nobody.

Animations arrive as ARTWORK. The shape a real game uses is the action
API (`createAnimation` / `attachAnimation` / `addAnimationFrame`), and
every frame used to be lost outright; now each becomes a costume on the
sprite it was attached to, named for the animation it came from. What
does not come with it is the playing: Scratch has costumes but no named
animation with its own timer, and a game binds several animations to one
sprite under the same `ActionKind`, so `setAction` cannot be resolved to
one of them. Said once, not once per call. Capped at 24 frames a sprite.

What does not survive: effects and particles, the physics engine's tile
COLLISIONS (the level is a picture, not terrain), animation PLAYBACK, music —
and, structurally, any script that moves a sprite other than its own,
which Scratch has no way to express. Each is named in the returned `unsupported` list and marked
`# unsupported` where it stood, and the status line says how many.

## Icons are an identity, not an approximation

`basic.showIcon(IconNames.Heart)` is in nearly every beginner MakeCode
program. It maps exactly: our `show pattern` lowers to `display.show()`
in MicroPython, and MakeCode's icon set and MicroPython's built-in images
are the same bitmaps. `microbit-icons.js` carries all 40 icons and 8
arrows, and the export direction reverses the lookup so a heart comes
back out as `basic.showIcon(IconNames.Heart)` rather than a grid.

The one real loss in that direction: our patterns carry brightness 0-9
and MakeCode's display literals are on/off, so a dimmed pattern exports
flattened — and says so.

A sprite's `width`/`height` are constants: the importer decoded the
picture to build the costume, so the bounds arithmetic a game writes is
exact rather than estimated, and `left`/`right`/`top`/`bottom` follow.
Trigonometry converts units — MakeCode's `Math.cos` takes radians and the
block takes degrees, and reading one as the other is wrong in a way that
still runs.

**Velocity is the one cross-sprite write that lands.** `vx`/`vy` already
live in a shared variable that the owning sprite's motion loop reads, so
another script setting it is exact and immediate. Position is not so
lucky: only a sprite can move itself. Scratch's idiom for the rest would
be a shared variable plus a broadcast — which works, one frame later, and
that difference is why it is a refusal here rather than a silent
approximation.

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

## The imported game RUNS

Compiling is a parse-level claim, and this repo's bar is higher — a
project can compile into blocks that start no thread and change nothing.
`test/makecode-arcade-runs.test.mjs` packages each translated game as a
real `.sb3`, loads it into the real Scratch VM with lite's real
extensions, pulls the green flag and steps it: threads must start, blocks
must survive packaging, something must change, and the VM must report no
block errors.

Three real games pass, including the pong whose cross-sprite work is
mostly refused — what is left still has to be a program, not a shell that
throws.

The micro:bit half asks for more (`makecode-microbit-runs.test.mjs`),
because its blocks are lite's OWN bundled extension rather than core
Scratch: a bundled extension method must actually be INVOKED. The
imported pin-reading program calls `microbitplus_analogread` about 34 000
times in 30 frames, which is the difference between blocks that exist and
blocks that run.

The device referee in `trace-oracle.js` cannot do this job: it models
hardware programs and refuses motion/looks/sensing outright.

## The labwired revision

The claim in wall 2 — "no permissive JS ARMv7E-M core" — was true of this
repo's *light* tier and is no longer true of its heavy tier. **labwired**
(`lib/labwired-engine.js`, fetched by `npm run sync:labwiredwasm`) covers
Cortex-M0+/M3/**M4**/M7/M33, RISC-V and Xtensa, and as of 2026-08-27 it
demonstrably RUNS from the browser in this app — `verify-labwired-engine.mjs`
drives an F030 program and insists the program counter moves.

Reading its target contract (`debug-target-factory.js`, `createLabwiredTarget`)
makes the Arcade path unusually concrete, because two of the three inputs
already exist:

| what labwired wants | what we would have to do |
|---|---|
| `firmware` — an **ELF** | nothing. MakeCode ships an `.elf` beside the `.hex`, and our importer already reads the embedded source out of one |
| `chipYaml` — a chip **descriptor** | write an nRF52833 one: memory map plus GPIO/GPIOTE, TIMER/RTC, SPIM, CLOCK. A description, not an emulator |
| `pins` + a `board` | the arcade shield's header map, and an ST7735 model with a framebuffer the stage can show |

So the cost is a chip description and a display model, not a CPU. What it
would buy is running an unmodified Arcade game — someone else's binary — with
no translation. What it would NOT buy is any of the *editing* story: a running
binary is not a project you can open, read or change, which is what the import
path gives.

The order therefore stands — import first, emulate later, and only if the
demand is for playing other people's games rather than learning from them —
but "later" is now a week of peripheral work rather than a rewrite.

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
- `microsoft/pxt-microbit` — GitHub's detector says **NOASSERTION**, but its
  `LICENSE.txt` was read: it is **plain MIT**, 25 lines, no extra clauses. The
  detector is thrown by the "PXT - Programming Experience Toolkit" line above
  the MIT header. So its tables are usable here — which is where two of the
  icon patterns come from.
- `bbcmicrobit/micropython` — **MIT**. 38 of the 40 icon patterns and all 8
  arrows come from its `microbitconstimage.cpp`, which is also where MakeCode's
  icons and MicroPython's built-in images both originate.
- `microbit-foundation/microbit-fs`, `microbit-universal-hex` — **MIT** (the
  V1/V2 storage formats implemented in `micropython-hex.js` are documented
  there).
- `maehw/microbit-pxt-code-extractor` — **GPL**. Do not read or borrow from
  it; the format is documented publicly at <https://makecode.com/source-embedding>
  and that is what this implementation follows.
- The LZMA decoder is written from the specification. The LZMA SDK the
  algorithm comes from is public domain.
