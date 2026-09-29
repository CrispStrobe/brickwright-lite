# Scratch → MakeCode Arcade: what the export maps, and what it refuses by name

The exporter is `overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js`
(Lite's own code, not vendored). It turns a Scratch project into one Arcade
TypeScript program (`main.ts` + `pxt.json`). The GUI calls it from
**Run as Arcade** / the Arcade download, and the CLI from
`node scripts/makecode.mjs to-ts <file> --target arcade`. The rule is the
census rule: a construct is either mapped, or **named** in `unsupported` and
left as a `// comment` where it stood. Nothing vanishes silently.

Some Scratch constructs have no single Arcade call. For those, the export
carries a small Static TypeScript runtime,
`overlay/scratch-gui/src/lib/bw-makecode/arcade-runtime.js`, and emits only
the helpers a program uses.

## Support matrix (task A4, 2026-09-29)

"Before" is origin/main `76d21c170`. There, every construct below was emitted
as a `// <opcode>` comment plus an `unsupported` entry naming the opcode, so it
was refused by name, not lost silently. A whole receiver or clone script was
one entry, which meant the blocks inside it were never looked at.

| construct | before | after | where (export-arcade.js unless noted) | held by (test/makecode-export-arcade-constructs.test.mjs) |
| --- | --- | --- | --- | --- |
| `broadcast` | refused (`event_broadcast`) | **mapped**: `_broadcast(msg)` starts every receiver in every sprite and every clone (`control.runInParallel`). Message names match case-insensitively, and a name built by a reporter is dispatched at run time. | `newStmt` L634, `dispatcher` L930, runtime `wait` | runs in the Arcade sim |
| `broadcast and wait` | refused | **mapped, real**: `_broadcast` returns a `_Wait` that counts the receivers it started, and `_await` blocks until every one of them has finished | L634, runtime `wait` | trace `132D`. Mutation "no wait" gives `D…` and goes red |
| `when I receive` | refused (whole script) | **mapped**: a named function per script. Started again while it runs, it **restarts** (Scratch's rule): the older run ends at its next yield | `scriptFunction` L896, runtime `gen` | trace of six, not eight. Mutation "no restart guard" goes red |
| `switch costume to` / `next costume` / `costume #/name` | refused | **mapped**: per-sprite `Image[]` of every costume (Lite's costume → palette-pixel conversion), `sprite.setImage`. Takes a name, a number, next/previous/random, or a reporter. The index lives in the sprite's `data`, so each clone has its own | L650, runtime `costume`, `pick` | image pixel after each switch. Mutation "no setImage" goes red |
| `switch backdrop to` / `next backdrop` / `backdrop #/name` | refused | **mapped**: stage `Image[]` (160×120) and `scene.setBackgroundImage`. A backdrop with no image is a plain colour, named in `warnings` | L676, emit L1066+ | on-screen pixel. Mutation "no setBackgroundImage" goes red |
| `when backdrop switches to`, `switch backdrop … and wait` | refused | **mapped**: switching starts those scripts, and "and wait" waits for them | L993, L676 | trace `HS`. Mutations "no wait" and "no hat" each go red |
| `create clone of` (myself / a sprite) | refused | **mapped**: a cloned sprite gets its own `SpriteKind`. `_clone_X(src)` = `sprites.create(src.image, kind)`, copying position, visibility, layer, costume, pen and the sprite's variables. Scratch's 300-clone cap is kept | L706, emit L1066 | three clones made |
| `when I start as a clone` | refused (whole script) | **mapped**: runs on the new clone (`self`). Every script of a cloned sprite runs on `self`, so key hats and receivers run on every instance | `scriptFunction` L896 | mutation "clone scripts not started" goes red |
| `delete this clone` | refused | **mapped**: `self.destroy()` for a clone and nothing for the original (as in Scratch). Its loops stop at the next yield (`_gone`) | L715, runtime `gone` | live clones 0, original kept, loops stopped. Mutation "no destroy" goes red |
| a cloned sprite's own variables | not applicable (clones were refused) | **mapped**: kept per instance in `sprite.data`, each clone's copy made from its parent's | `lookupVar` L317 | `103 111 112 113`. Mutation "shared data" goes red |
| `touching <cloned sprite>` | not applicable | **mapped**: the sprite or any of its clones (`_touching`) | runtime `touching` | compile corpus |
| `play sound` / `play sound until done` | refused (`sound_play…`) | **mapped when the sound is one steady tone**: `music.playTone(Hz, ms)`, measured from the audio (`analyseTone`, arcade-runtime.js). This covers every `SOUND name freq` that Lite declares. Non-blocking plays run in parallel | L772, arcade-runtime.js `analyseTone` | tones and times in the sim. Mutation "until done no longer waits" goes red |
| sampled audio (a voice, a drum loop, a sweep) | refused | **named refusal**: `play sound "x": sampled audio — not one steady tone …` | L772 | unit test with noise and a sweep |
| `stop all sounds`, volume (set/change/reporter) | refused | **mapped**: `music.stopAllSounds()`, `music.setVolume/volume` (0–100 → 0–255). Arcade's volume is one global setting, named in `warnings` | L772+ | compile corpus |
| Music: `play note`, `rest`, `set/change tempo`, `tempo` | refused | **mapped**: `music.playTone(_hz(note), _beats(b))`, `pause(_beats(b))`, `_tempo` | L805, runtime `music` | 440×500 at 60 bpm, 262×500 at 120 bpm, 250 ms rest |
| Music: `play drum` | refused | **named refusal that keeps its time**: a rest of the same length (so what follows stays in step) plus the name | L805+ | unit test |
| Music: `set instrument`; sound effects (pitch, pan) | refused | **named refusal** | L805+ | — |
| lists: add, insert, delete, delete all, replace, item, item #, length, contains, contents | refused (`data_*list*`) | **mapped**: `any[]` with Scratch's rules. 1-based; `last`/`random`/`all`; an out-of-range read is `""` and an out-of-range write changes nothing; `item #` and `contains` ignore case | `listStmt` L257, L476, runtime `list` | trace `z32cY0`. Mutations "0-based item" and "case-sensitive find" each go red |
| `show list` / `hide list` | refused | **named refusal**: Arcade has no list monitors | L805+ | unit test |
| a cloned sprite's own **list** | not applicable | **named partial**: one list shared by the sprite and its clones | `listName` | — |
| pen: down, up, clear, stamp, set colour, pen size | refused (`pen_*`) | **mapped**: a transparent 160×120 layer sprite under every other sprite (so a backdrop switch does not erase it). A pen-down sprite's moves draw the line they moved along (`_penTo`); the colour is the nearest palette colour; the size is Scratch's size ÷ 3 | L726, runtime `pen` | red line on screen row 60, and `clear` erases it. Mutation "moves don't draw" goes red |
| pen colour by a reporter; pen hue, saturation, brightness, transparency | refused | **named refusal**: Arcade pens are one of 16 palette colours | L726+ | unit test |
| the mouse: `mouse x/y`, `mouse down?`, `touching mouse-pointer`, `go to / glide to / point towards mouse-pointer`, `distance to mouse-pointer`, `when this sprite clicked`, `when stage clicked` | refused (by opcode) | **named refusal with the reason** (`MOUSE_WHY`, L48): Arcade hardware has a d-pad and A/B. pxt-arcade's `browser-events` reads a mouse only in the browser simulator, so a game built on it would do nothing on a device. | L456 and the other mouse cases | unit and compile test |

Also fixed on the way: `=` compares a bare variable as `any`
(`(x as any) == 0`, L409). TypeScript narrows a `let` to the literal it was last
given, so `x = 1; … x == 0` is a compile error, and a costume name can meet a
number. Two lite games (`turbo_chicane`, `lockstep_lagoon`) hit this as soon as
their receiver scripts were exported rather than dropped. `as` is compile-time
only, so the comparison's behaviour is unchanged.

A switch to a costume or backdrop **name the project does not have** does
nothing in Scratch, and does nothing here too. It becomes a comment and a
warning, not a refusal (L135).

## Evidence

- **Behaviour, in pxt-arcade's own simulator.** `scripts/lib/makecode-arcade-sim.mjs`
  runs the compiled program headless, on a virtual clock. It uses the
  simulator's own runtime and scene; the view, the clock and the speaker are
  replaced, and the tones are recorded. Each test exports a small Scratch
  project, compiles it with pxt-arcade 4.2.1 (the offline compiler Lite ships),
  runs it, and checks a trace, the tones or the screen pixels.
- **Mutations.** For each mapping, the test also runs the emitted TypeScript
  with that mapping's essential step undone. The check must fail on that
  version, and it does (13 mutations).
- **Corpus.** `test/makecode-export-arcade.test.mjs` still compiles all 38 lite
  game examples and the 4 imported Arcade fixtures (42/42) with MakeCode's
  compiler. The corpus now also passes sound bytes, so the tone mapping runs
  there too.
- **Refusal census over the 38 lite games** (count of `unsupported` entries,
  before → after): broadcasts 79 → 0, backdrops 38 → 0, lists 32 → 0,
  sounds 18 → 2 (one sound the node parse has no audio for, and one chosen by
  a reporter), pen 17 → 0, costumes 13 → 0, clones 13 → 0. Mouse went from
  18 → 24, and "other" (move, turn, show variable, …) from 50 → 143. Both rose
  only because receiver and clone scripts used to be refused as one entry and
  are now emitted, so the blocks inside them are named one by one.

## What remains

- The mouse stays a named refusal, by decision (above).
- Sampled audio stays a named refusal. A sound Arcade could play needs to be
  one steady tone.
- A cloned sprite's own list is shared by its clones (named). Its variables
  are per clone.
- Broadcast restarts take effect at the next **yield** (a loop pass or a
  wait), not in the middle of a straight run of blocks. That is the same
  point where Scratch's scheduler switches threads.
- Out of A4's scope and still named: move/turn/direction, glide, size and
  graphic effects, `think`, `ask`, variable monitors.
- Found, not fixed (out of A4's scope): `stop` maps every option to
  `game.over(false)`. That is right for `stop all`, but ends the game for
  `stop this script` and `stop other scripts in sprite`, and it is not named.
