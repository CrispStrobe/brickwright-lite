# Conversion compatibility audit

`scripts/compat-audit.mjs` and `scripts/conversion-roundtrips.mjs` measure how much of a
corpus of MakeCode programs Lite's importer, translator and exporter carry. The
`makecode` CLI converts one project. These tools inspect many. A parsed or stepped project
is **not** proof that graphics, sound, hardware, timing or extension behaviour match the
original. The audit keeps those gates apart, and each needs its own focused test.

Ported from the parked Codex WIP (branch `wip/codex-parked-main-checkout-20261005`,
`23e9c7f44`) as task F1 of [OPEN-TASKS-2026-09-29.md](OPEN-TASKS-2026-09-29.md). The WIP's
TurboWarp corpus, its TurboWarp reports and its `.sb3` native round-trip script are not
ported: TurboWarp is clean-room only for this project.

## Convert one project

```sh
npm run makecode -- to-sb3 game.ts --target arcade -o game.sb3 --bw game.bw
npm run makecode -- to-sb3 microbit.hex -o microbit.sb3
npm run makecode -- to-ts game.sb3 --target arcade -o main.ts
npm run makecode -- to-hex game.sb3 --target arcade --board rp2040 -o game.uf2
npm run makecode -- to-hex robot.bw --target microbit -o robot.hex
```

A bare `.ts` input is a single MakeCode `main.ts` with the target's default packages. A
program that needs another package should be imported from an embedded-source `.hex`, `.uf2`
or cartridge. Arcade firmware needs `--board` (one of `ARCADE_HARDWARE` in
`lib/bw-makecode/pxt-runtime.js`) and that board's firmware base, which `npm run
sync:makecode` serves. Without the base, the build is refused by name (exit 1). `--source`
writes an editable project file instead. Every conversion lists what did not translate on
stderr.

## Audit a corpus

```sh
npm run compat:audit -- --target arcade --compile --execute \
  --out arcade.json --markdown docs/generated/ARCADE-COMPAT-AUDIT.md makecode/arcade
npm run compat:audit -- --target microbit --compile --execute \
  --out microbit.json --markdown docs/generated/MICROBIT-COMPAT-AUDIT.md makecode/microbit
node scripts/conversion-roundtrips.mjs --compile --out roundtrips.json makecode/arcade makecode/microbit
node scripts/report-roundtrips.mjs roundtrips.json docs/generated/CONVERSION-ROUNDTRIPS.md
```

Run these from the corpus root, so the reports carry corpus-relative paths.

- **Stages:** `translated` (no named gap, no Code-to-Blocks warning), `partial` (at least
  one named gap or warning), `parse-failed`, and `pxt-compile-failed` (with `--compile`).
- **`pxt-compile-failed`:** the pinned PXT compiler rejects the source itself. That is not
  counted as a Brickwright gap. Many corpus entries are documentation snippets that need an
  extra package or earlier lesson code.
- **`--execute`:** steps 24 frames after the green flag in a headless Scratch VM. The run
  includes the importer's artwork (`uploads`), exactly as the importer GUI applies it.
  Without the artwork, every Arcade image read fails, and the run measures the harness
  instead of the game.
- **`--limit N`:** gives a repeatable smoke run in sorted path order.
- **Exit code:** nonzero for read, parse, missing-asset or missing-opcode rows.

## Where the corpus lives

The corpus is the pinned 828-file set in the private repository
`CrispStrobe/brickwright-firmware-private`, under `compat-corpora/`. Its `manifest.json`
records the SHA-256, upstream revision, URL and licence of every file. The MakeCode part
(215 micro:bit and 184 Arcade examples) comes from `pxt-microbit` 9.1.1 and `pxt-arcade`
docs, both MIT. `scripts/collect-makecode-corpus.mjs` re-extracts it. The corpus is test
data: it is never shipped and never committed here. Lite's CI cannot reach it, so its
tests use small inline fixtures.

## Results on main

Corpus: `brickwright-firmware-private` `19a52f6d6` (`compat-corpora/makecode`). The
reports linked here are the current ones, generated with `--compile`:
[Arcade](generated/ARCADE-COMPAT-AUDIT.md), [micro:bit](generated/MICROBIT-COMPAT-AUDIT.md),
[round trips](generated/CONVERSION-ROUNDTRIPS.md).

| | F2 (main `31a505c30` + F1) | after F5–F9, F11 (2026-10-06) |
|---|---|---|
| Arcade static audit | 89 translated / 94 partial / 1 parse-failed | **90 / 93 / 1** |
| Arcade `--execute` (24 frames) | 171 stepped, 7 event-only, 5 block errors | **175 stepped, 7 event-only, 1 block error** |
| Arcade MakeCode → Code → MakeCode | 70 preserved, 12 rejected by PXT, 1 error | **81 preserved, 0 rejected**, 0 errors, 2 "source invalid" |
| micro:bit static audit | 205 / 10 | 205 / 10 |
| micro:bit round trip | 197 preserved | 197 preserved |

With `--compile`, PXT itself rejects 53 Arcade and 9 micro:bit documentation snippets as
bare `.ts` files: undeclared names, or a missing package or asset. Those are counted apart
from translation gaps. In the round trip, "source invalid" is a re-export that MakeCode
rejects when it also rejects the original.

**Against the parked WIP.** Both trees were run on the same corpus and the same scripts; the
WIP's own run reproduces its 89 / 94 / 1. The WIP's stored reports in the corpus
repository are an older baseline (2026-09-27, 27 translated).

- **micro:bit:** main is ahead in both views: 205 / 10 against 166 / 49 statically, and
  197 preserved round trips against 106.
- **Arcade static audit:** main is ahead, 90 / 93 / 1 against 89 / 94 / 1.
- **Arcade round trip:** main preserves 81 against the WIP's 82. Three projects the WIP
  preserves are not preserved on main, and two go the other way. Each of the three is named
  below.

**What F5–F9 and F11 fixed** (rows in section F of the task file):

- **F5 — Arcade re-exports MakeCode rejected (12 → 0):**
  - A stop guard's bare `return` inside a value-returning function.
  - A cloned sprite's interval/update hat that used an unbound `self`.
  - A named list read as an array reference (`.length`/`.push` on a number).
  - Globals typed `number` because the importer had turned unknown art (`sprites.dungeon.*`)
    or an unread asset into a silent variable.
- **Three silent import losses**, now carried or named:
  - Untagged template strings with placeholders had become `"(image)"`.
  - PXT's built-in art stored as `{data}` entries was missing. The table went from 507 to
    763 images and now includes all of `sprites.dungeon`. Unknown built-in art is named.
  - A sprite property written through a value the stage cannot follow (`paddle.x = …` in a
    loop, a text sprite) had become `set 0 to …` / `change 0 by …`.
- **F7 — run-time errors in partial projects (5 → 1):** an untranslated array stands in as
  an empty one, and the named-list fix above closed two of them.
- **F8 — Lite's own export reads back as itself:**
  - The run-token machinery A5's `stop` blocks export is lifted back to `stop all` /
    `stop other scripts in sprite`; before, `stop all` was lost.
  - `!x` in a condition is `not` again (E9's `x === false` value form had leaked into
    conditions).
  - Literal say-block arguments stay literals.
- **F9:** `fn: () => void` parameter types parse.
- **F11:** `Math.percentChance` (6 projects), `Math.clamp` and `control.millis` translate as
  their PXT definitions.
- **Also:** `pick random a to b` is parenthesised as an operand. Before, it swallowed
  `- 80` and read back as `randint(a, b - 80)`.

**Still open, named:**

1. **sb3-creator (F6), fixed upstream and waiting for a pin move:** a body made only of
   `# comment` lines put its comments on the next script, and an empty hat's body indent
   came from the following blank line. The fix is on CrispStrobe/sb3-creator branch
   `fix/trailing-comments-empty-bodies` (3 commits). Its fast suite passes (1047/0) and its
   slow suite passes (102/0). With it, every program the Arcade importer writes reaches a
   decompile fixed point, and `test/dialect-arcade-import-lines` lists four that do not
   until then. It also clears the 4 "error" rows on the MakeCode → Code → SB3 → Code path.
2. **`arcade-28379fc0…` (1 block error):** MakeCode registers `game.onPaint` only after its
   top-level code has run, while a Scratch hat is live from the green flag. The paint
   handler runs before `snake` is set.
3. **Round-trip differences against the WIP (3):**
   - `arcade-268aab83…`: the fixed-sprite path keeps Arcade's score as a Scratch variable
     `score`, which the exporter renames `score_`, so the Arcade HUD score is lost on
     export. Changing that is a product decision.
   - `arcade-a0f564a6…`: equivalent. Arithmetic re-imported through the value path is
     `calculate value`, not `operator_multiply`.
   - `arcade-6ae4c8f0…`: an array literal passed to a function is a named gap on the
     fixed-sprite path. The doc snippet's function body is empty.
4. **`sprite.data` (5 projects):** needs a new Arcade dialect word upstream in sb3-creator,
   plus VM support.

The most frequent named Arcade gaps are listed in the generated report's frequency table.
The top one, `scene.setBackgroundImage()` with art we could not read (10), is art from
project asset files or extension packages that a bare `.ts` snippet does not include.
