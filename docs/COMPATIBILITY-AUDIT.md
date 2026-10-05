# Conversion compatibility audit

The conversion CLI and corpus audit answer different questions. `makecode` writes a converted project or firmware; `compat-audit` inspects many inputs and records translation, unsupported elements, optional MakeCode compilation, and optional headless VM stepping. A parsed or stepped project is **not** proof that graphics, sound, hardware, timing, or extension behavior matches the original.

## Convert one project

Run from the repository root:

```sh
npm run makecode -- to-sb3 game.ts --target arcade -o game.sb3 --bw game.bw
npm run makecode -- to-sb3 microbit.hex -o microbit.sb3
npm run makecode -- to-ts game.sb3 --target arcade -o main.ts
npm run makecode -- to-hex game.sb3 --target arcade --board rp2040 -o game.uf2
npm run makecode -- to-hex robot.bw --target microbit -o robot.hex
```

The `.ts` input is a single MakeCode `main.ts`; it has default target dependencies, so projects requiring extra packages should be imported from an embedded-source `.hex`, `.uf2`, or cartridge. For Arcade firmware, choose a synced board with `--board`; `--source` writes an editable source container without firmware. Run `npm run sync:makecode` first for local firmware compilation. Each conversion writes named unsupported elements to stderr.

## Audit a corpus

```sh
npm run compat:audit -- --target microbit --compile --execute \
  --out test-results/microbit.json --markdown docs/generated/MICROBIT-COMPAT-AUDIT.md \
  /path/to/corpus/microbit
npm run compat:audit -- --target arcade --compile --execute \
  --out test-results/arcade.json --markdown docs/generated/ARCADE-COMPAT-AUDIT.md \
  /path/to/corpus/arcade
npm run compat:audit -- --execute --out test-results/turbowarp.json \
  --markdown docs/generated/TURBOWARP-COMPAT-AUDIT.md /path/to/projects
```

`--limit N` gives a repeatable smoke run in sorted path order. The command accepts `.ts`, `.hex`, `.uf2`, `.elf`, and `.sb3`; pass a `.png` cartridge as an explicit file path. JSON has one row per file with its source path, stage, unsupported calls, missing opcodes, extension URLs, assets, compile diagnostics, and execution outcome. Markdown groups these gaps by frequency and lists failures. With `--compile`, source rejected by the pinned PXT compiler receives the separate `pxt-compile-failed` stage and keeps its diagnostics; it is not counted as a Brickwright translation gap in that audit. A bare `.ts` file may lack its original extension dependencies, so inspect the diagnostics before deciding whether the source itself is invalid. A nonzero exit indicates a read, parse, asset, missing opcode, or unsupported mode failure; `partial` and externally supplied extensions remain visible in reports even when the command exits zero for those rows.

The PXT compiler baseline uses default target packages for individual `.ts` files. A documentation snippet may need an external package, earlier lesson code, or generated assets. A baseline compile failure therefore does not by itself indict Brickwright. `--execute` steps 24 frames after green flag in a headless Scratch VM. Projects driven by keyboard, sensors, camera, or radio may have no green-flag thread; this is reported separately. Runtime feature equivalence needs focused tests with inputs and expected outputs.

## Pinned corpus and current findings

`scripts/collect-makecode-corpus.mjs` extracted 215 micro:bit examples from `pxt-microbit` 9.1.1 and 184 Arcade examples from `pxt-arcade` commit `8ae4f42df2b2f4a0472b0da04c3cdcd3438dbb02`. The manifest records source URLs, SHA-256 hashes, and license. The corpus lives on the storage mount at `/mnt/storage/brickwright-corpora/collected`; it is test data, not shipped app code. The official TurboWarp extensions repository at `a1e8e143a47738a95217ebd77c8875ae3e468752` provided 16 gallery samples. TurboWarp Scratch VM at `c4823421cb7c17d8d8a89878851ce1668c26a21f` provided 131 `.sb3` fixtures, including deliberately damaged files.

The pinned 828-file corpus and the conversion reports are also in the private `CrispStrobe/brickwright-firmware-private` repository under `compat-corpora/` (commit `15554ad`). `scripts/package-compat-corpus.mjs` recreates the upload set and SHA-256 manifest from the pinned local sources.

| Corpus | Observed result | Main gaps |
|---|---|---|
| micro:bit 215 | 206 compiled with upstream PXT; 166 translated without named gaps, 49 partial in the individual-source audit; all 215 stepped in the headless VM | music, LED/image calls, package-dependent APIs |
| Arcade 184 | 130 compiled with default PXT packages; 46 translated without named gaps or Code-to-Blocks warnings, 137 partial, 1 incomplete snippet failed parsing; 178 stepped in the earlier headless VM audit, 5 had no green-flag thread | sprite references, changing background color, callbacks, project assets |
| TurboWarp gallery 16 | 2 use bundled offline implementations, 13 require external extension validation, 1 uses a missing procedure-return opcode | extension APIs, reporter returns |
| TurboWarp VM fixtures 131 | 105 parsed with no statically missing opcode; of those, 69 stepped in the headless VM and 36 had no green-flag thread; 14 had missing blocks, 7 external extensions, 3 unreadable zip contents, 2 missing assets | procedure returns, test-only extension blocks |

The broader `scripts/makecode-census.mjs` check does full import, simulator code generation, re-export, and PXT recompilation on the 215 micro:bit examples and 282 Brickwright examples. Its report is [MAKECODE-CENSUS.md](generated/MAKECODE-CENSUS.md). The audit's 17 “silent-loss” entries are **candidates** detected by call-name comparison; transformations such as `music.beat` can be valid, but must be inspected individually. The generated [Arcade](generated/ARCADE-COMPAT-AUDIT.md), [TurboWarp gallery](generated/TURBOWARP-COMPAT-AUDIT.md), and [TurboWarp VM](generated/TURBOWARP-VM-COMPAT-AUDIT.md) reports list every detected gap.

The [no-step report](generated/NO-STEP-GAPS.md) separates event-only projects from parse, asset, opcode, and extension blockers. All five Arcade button-only snippets started when the corresponding key was pressed. [Conversion round trips](generated/CONVERSION-ROUNDTRIPS.md) compare project structure across MakeCode → Brickwright code → SB3 and reverse paths; [PXT recompile results](generated/MAKECODE-ROUNDTRIPS-COMPILE.md) identify reverse exports the original MakeCode compiler rejects. Plain `.bw` cannot carry image and sound bytes, so keep `.sb3` as the sharing format for artwork. A native `.sb3` load/save with storage preserved 96 of 105 self-contained TurboWarp VM fixtures at the asset-byte and block-opcode level; nine changed asset bytes or IDs in the headless environment, including two deliberately corrupt assets. The two self-contained gallery samples preserved project data and assets; their external URLs were normalized to bundled offline implementations.

This pass added conditional expressions and optional parameters to the MakeCode parser, conditional icon/arrow display, radio receive callback state on export, Arcade screen dimensions and a single constant startup background color, direct `.ts` conversion, board-specific Arcade UF2 output, and offline Base64 and temporary-variable blocks used by two TurboWarp gallery projects. The Base64 extension supports UTF-8 Base64; its other modes remain explicitly unsupported. The temporary-variable implementation covers the four opcodes exercised by its sample. TurboWarp procedure-return blocks remain unsupported and are marked as such.

Arcade sprite handle blocks now run in the VM and round-trip through Code and `.sb3`; [their current scope and remaining import work](ARCADE-SPRITES.md) are documented separately. Most MakeCode Arcade imports still use the earlier fixed-target mapping, so corpus sprite failures should not yet be considered resolved.

A guarded creation-event path now translates the pinned asteroid example with sprite handles, `sprites.onCreated`, and its two PXT built-in image choices. A second path translates a pinned fire game with named sprite handles, `onCreated`, `onOverlap`, screen bounds, and start/stop countdown. A native countdown-end event now runs MakeCode `info.onCountdownEnd` callbacks and lets the handler decide whether to end the game. The refreshed 184-project static audit has 31 translated projects. Eighteen projects still report an `onCreated` gap. These counts do not imply behavioral parity for the other Arcade examples.

Top-level MakeCode `forever` callbacks now become running Arcade scripts. This removes the `forever()` refusal from three corpus snippets, but exposes projectile and tilemap calls inside them.

A guarded projectile path now preserves top-level `createProjectileFromSide` and `createProjectile` images, incoming edge position, velocity, named handle, and automatic off-screen destruction. Overlap-only snippets use kind-filtered event hats with their callback sprite identities. Direct `game.askForString` assignments ask and wait before using the answer. These paths moved five more pinned snippets to translated, bringing the static audit to 36/147. Effect-rendering arguments and prompts nested inside larger expressions remain named gaps.

`music.stopAllSounds()` uses Scratch's existing sound block, bringing the static audit to 37 translated and 146 partial. This remains a syntax and structural count; the browser and VM checks cover selected behavior only.

Arcade `console.log` now writes to a bounded serial buffer shown in the Arcade device pane. Three more pinned snippets have no named translation gaps, yielding 40 translated and 143 partial. Multi-value log calls remain marked unsupported until their formatting is implemented.

Single-argument `sprite.sayText` now creates a persistent speech bubble, and the Code parser keeps `go to back` as a layer block. A missing sprite image now counts as an explicit gap; bundled PXT food and castle art restores five otherwise incomplete examples. One `lab2imgs.crystal_ball` sample still lacks its external package art. Earlier counts did not flag missing built-in or package images.

The audit now treats Code-to-Blocks parser warnings as partial imports. One optional-argument procedure call now creates a runnable block with a zero placeholder, but stays partial because the source parameter's omitted-value semantics have not been proved. An overlap handler whose sprite kind has no sprite in the snippet also stays partial. The corrected count is 39 translated, 144 partial, 1 parse-failed.

Arcade `Math.min`, `Math.max`, `Math.map`, and `Math.pow` now use runnable math reporters with every argument. Earlier translation silently kept only the first operand. The VM regression checks the resulting values; these repairs do not change the static gap count because the audit previously failed to recognize that loss.

Plain `info.onLifeZero` now waits for lives to become positive, runs its callback when they fall to zero, and rearms if the callback restores lives. The same rearming behavior replaces the one-shot `info.playerN.onLifeZero` poll. A discarded array `pop()` now removes the last item through a command block; its previous reporter-only line could not execute in a Scratch stack. The static Arcade audit is now 40 translated, 143 partial, 1 parse-failed. High-score snippets still expose loop `break` and external storage calls.

A single startup `scene.setBackgroundColor(randint(1, 15))` now carries all 15 opaque Arcade palette colors as costumes and chooses one at runtime. A pinned corpus sample, VM check, and browser import check cover the selection. Later or multiple background changes still remain explicit gaps. The latest static audit is 41 translated, 142 partial, 1 parse-failed.

Arcade number and text prompts now have runnable reporters, and `game.splash` and `game.showLongText` have blocking dialog commands that export back to PXT. Ordinary sprite targets keep stable MakeCode variable names when those names do not collide with an API or another variable. The current static audit is 46 translated, 137 partial, 1 parse-failed. The refreshed 546-input roundtrip report counts explicitly unsupported elements as partial and compares decoded Arcade image pixels; only 28 of 183 parsable Arcade sources preserve the measured structure and art with no named gap on the reverse path. This is still a structural check, not full runtime parity.

PXT target code and metadata are MIT licensed. TurboWarp compatibility additions here were written from observed project block shapes and public behavior descriptions; no TurboWarp extension implementation source was copied into the app. Prioritize the remaining items from the generated frequency tables, add a focused behavior fixture for each, and rerun the corpus before calling it supported.
