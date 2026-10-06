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

## Results on main (F2, 2026-10-06)

Lite `31a505c30` plus the F1 port. Corpus `brickwright-firmware-private` `19a52f6d6`
(`compat-corpora/makecode`). Reports:
[Arcade](generated/ARCADE-COMPAT-AUDIT.md), [micro:bit](generated/MICROBIT-COMPAT-AUDIT.md),
[round trips](generated/CONVERSION-ROUNDTRIPS.md). All three were generated with `--compile`.

| corpus | static audit (no compiler) | with `--compile` | `--execute` (static rows, 24 frames) |
|---|---|---|---|
| Arcade 184 | **89 translated / 94 partial / 1 parse-failed** | 83 / 47 / 1, and 53 rejected by PXT itself | 171 stepped, 7 no green-flag thread, 5 block errors |
| micro:bit 215 | 205 translated / 10 partial | 203 / 3, and 9 rejected by PXT | 214 stepped, 1 no green-flag thread |

**Main against the parked WIP.** Both trees were run on the same corpus with the same
static audit. The WIP's own run reproduces its 89 / 94 / 1. The WIP's stored reports in the
corpus repository are an older baseline (2026-09-27, 27 translated).

- **Arcade:** same totals. 178 projects are identical. One is better on main
  (`arcade-add5f539…`: `break` inside a loop now translates). One is worse
  (`arcade-6ae4c8f0…`: "Array as a value"). Two partial projects gain a gap on main:
  `arcade-318e958c…` "Update as a value" and `arcade-90a0e61d…` "Array as a value".
- **micro:bit:** main is ahead, 205 / 10 against the WIP's 166 / 49. 39 projects are
  better, none is worse.

**Round trips** (MakeCode → Code → MakeCode, re-compiled by PXT):

- **Arcade:** 70 preserved, 42 partial, 58 with loss, 12 rejected by PXT, 1 error. The
  parked WIP tree, run the same way (without the compiler), preserves **82**, so main is
  behind here. 13 projects the WIP preserves are not preserved on main, and one goes the
  other way. All 13 differ in block-opcode counts after the round trip: `operator_not` ×4,
  `control_stop` ×4, `operator_equals` ×2, and one each of `data_changevariableby` and
  `operator_multiply`. These are the opcodes E9 (`not` in value positions) and A5 (`stop`)
  reshaped. Whether each one is an equivalent re-encoding or a real loss is still to be
  checked.
- **micro:bit:** 197 / 7 / 11, with none rejected. The WIP tree preserves 106.
- **The SB3 hop:** it reports "loss" for every project. Plain Code text cannot carry
  artwork bytes, so keep `.sb3` as the sharing format for art.

**Defects these runs found on main.** Each is a row in section F of the task file:

1. **12 Arcade re-exports that PXT rejects.**
   - `Argument of type 'number' is not assignable to parameter of type 'Image'` (×3) or
     `'Sprite'` (×2).
   - `Property 'length'` / `'push' does not exist on type 'number'` (×3).
   - `Not all code paths return a value` (×3).
   - `Cannot find name 'self'` (×1).
2. **sb3-creator decompile of a comment-only script body.** In 4 projects
   (`microbit-7d6ced57…`, `microbit-09623dfc…`, `arcade-6c646058…`, `arcade-e3f69fce…`),
   a script whose body is only `# unsupported:` comments decompiles with the comments
   outside its hat. The next script then reads as mis-indented, and the parser refuses it.
   This belongs upstream in CrispStrobe/sb3-creator. Before D5, these lines were dropped
   silently.
3. **"Array reference is null or expired"** at run time in 5 partial Arcade projects:
   `arcade-013bd6d9…`, `-28379fc0…`, `-5eb37c86…`, `-6782c0ed…`, `-85a1c4be…`.
4. **Arcade reverse-path preservation is 70 on main against the WIP's 82** (see above),
   in `not`/`stop`/comparison opcode counts.
5. **One re-import error:** `arcade-f583b791…` re-exports an arrow function the TS
   importer cannot read (`expected { but found "=>"`).

The most frequent named Arcade gaps are in the generated report's frequency table. The top
three are `scene.setBackgroundImage()` with unreadable art (10), `tiles.setTilemap()`
without a literal wall layer (7), and `Math.percentChance()` as a value (6).
