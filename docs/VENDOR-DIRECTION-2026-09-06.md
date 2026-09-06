# Vendor direction, bw-board → lite (2026-09-06)

A measurement, not a change. Nothing was synced and no pin moved.

**Question:** `sync --check` reports vendored files DIFFERING and says, correctly,
that it cannot tell BEHIND from AHEAD. This answers the direction per file, from
content.

**Method.** Three points, all by git sha, none from memory:

- lite at `origin/main` (`38b76cb25`), `overlay/scratch-gui/src/lib/bw-board/<f>`
- bw-board at the **current pin** `88bbdcf78`, `src/<f>`
- bw-board at **master** `9500cf9`, `src/<f>`

Then: equal to master → in-sync. Equal to the pin but not master → **BEHIND**
(upstream moved). Different from the pin, and pin equals master → **AHEAD**
(lite forward-ported). Different from both → **MIXED**. Absent in lite → **MISSING**.

## Read this before re-running the check

**The number depends on which tree you measure.** Running `sync-bw-board.mjs --check`
inside `/mnt/volume1/code/lego/brickwright-lite` gave **30** differing files. From a
clean worktree of `origin/main` it gives **23**. The shared checkout is **151 commits
behind `origin/main`**, and the script reads the working tree, not `HEAD` — so seven
files (`cga-card`, `i8086`, `i8259`, `ne2000`, `rp2040-bootrom`, `rp2040js-adapter`,
`target-kinds`) show as differing there and are byte-identical on main.

Two further traps, both paid for here:

- The flag is **`--dir`, not `--src`**. `--src` is silently ignored and the script
  fetches from the remote instead — which is why a run that looked local was not.
- With `--dir`, the summary says *"the checkout at …"*; without it, it prints a sha.
  If you see a sha you compared against the remote, whatever directory you passed.

**Falsifiable:** check out `origin/main` into a fresh worktree, run
`node scripts/sync-bw-board.mjs --check`, and the count is 23. If it is not, this
document is measuring a different tree than you are.

## The 23, by direction

| file | direction | owner | allow-list | bytes lite/master |
|---|---|---|---|---|
| `avr8js-debug.js` | **AHEAD** | debugger lane | — | 18000/17686 |
| `debug-session.js` | **AHEAD** | debugger lane | — | 10220/7500 |
| `debug-target-factory.js` | **AHEAD** | debugger lane | — | 19359/19875 |
| `emu8051-adapter.js` | **AHEAD** | — | allow-list | 21755/18338 |
| `emu8051-debug.js` | **AHEAD** | debugger lane | — | 42908/30409 |
| `i8086-adapter.js` | **AHEAD** | — | — | 3764/3583 |
| `i8086-debug.js` | **AHEAD** | debugger lane | — | 52012/37761 |
| `index.js` | **AHEAD** | — | — | 4977/4941 |
| `m6502-adapter.js` | **AHEAD** | — | — | 7776/7487 |
| `m6502-debug.js` | **AHEAD** | debugger lane | allow-list | 18594/11874 |
| `m6502-machine.js` | **AHEAD** | — | allow-list | 42180/38415 |
| `reseat-gate.js` | **AHEAD** | — | — | 8112/10481 |
| `rp2040js-debug.js` | **AHEAD** | debugger lane | — | 17898/17601 |
| `w65c51.js` | **AHEAD** | — | — | 6463/6461 |
| `z80-adapter.js` | **AHEAD** | — | — | 11358/11256 |
| `z80-debug.js` | **AHEAD** | debugger lane | allow-list | 15367/10205 |
| `z80-machine.js` | **AHEAD** | — | allow-list | 28408/24928 |
| `zx-ula.js` | **AHEAD** | — | — | 14856/14027 |
| `i8237.js` | **BEHIND** | — | — | 21077/26006 |
| `i8255.js` | **BEHIND** | — | — | 7643/7982 |
| `i8088-cycles.js` | **MISSING** | — | — | 0/974864 |
| `i8088-timing.js` | **MISSING** | — | — | 0/7947 |
| `i8086-machine.js` | **MIXED** | — | allow-list | 78663/85634 |

18 AHEAD · 2 BEHIND · 2 MISSING · 1 MIXED.

## The `--only` list for a pin to master

The ask was a list carrying lego-a4's media-aware table (`8064729`) and lego-be's
`chipRefusals()` (`bfd8b44`).

**`8064729` cannot be carried by a `src/` sync at all.** It touches
`rom/bios.asm`, `ROADMAP.md` and `test/bios-media-detect.test.mjs` — **no `src/`
file**. `sync-bw-board.mjs` copies only `src/`, so no `--only` list reaches it.
Lite carries the BUILT artefact `overlay/scratch-gui/static/roms/i8086-bios.bin`,
which has to be rebuilt from the new `bios.asm` and vendored by a different path.

*Falsifiable: `git show --name-only 8064729` lists no path under `src/`.*

`bfd8b44` touches `i8086-machine.js` and `i8237.js`.

```
--only i8237.js,i8255.js
```

`--only` takes ONE comma-separated argument, not a repeated flag — `scripts/sync-bw-board.mjs:223` reads `argv[onlyIdx + 1]` and splits on commas, so `--only a.js --only b.js` silently narrows to `a.js` and drops the rest of the list on the floor. It does not error.

`i8237.js` is the half of `bfd8b44` a `src/` sync can carry. `i8255.js` is not
required by either named commit; it is included because it is **BEHIND** and free
— but if the goal is a minimal pin move, `--only i8237.js` alone is defensible.

Both are BEHIND: lite is byte-identical to the pin and upstream has moved.
Overwriting them loses nothing.

*Falsifiable: for each, lite's sha equals the file at `88bbdcf78` and differs from
`9500cf9`. If lite differed from the pin, this row would be wrong.*

**`i8086-machine.js` is NOT in that list**, although `bfd8b44` touches it — see below.

`upd765.js` is **in-sync** and needs no entry; it is byte-identical across all three.

## Must NOT be synced

**`i8086-machine.js` — MIXED.** Both trees moved. It carries **nine** named
forward-ports in `docs/VENDOR-DIVERGENCE-I8086-MACHINE.md` (the display-revision
token and its VRAM/CRTC-governed bumps among them). A sync overwrites; a merge is
required, and it must preserve every allow-list entry, pick up `chipRefusals()`,
**and honour the tenth divergence, which is not in the allow-list** — see below.

*Falsifiable: run the sync with the allow-list in force; it refuses by name. If it
does not refuse, the allow-list is not being read and nothing here protected it.*

### The unrecorded tenth divergence: lite has no cycle estimator

`docs/VENDOR-DIVERGENCE-I8086-MACHINE.md` names nine `liteOnly` forward-ports for
this file. There is a tenth difference, in the other direction, and it is written
down nowhere:

- Upstream, **at the current pin and at master alike**, line 44 is
  `import { CycleEstimator } from './i8088-timing.js';`, and `_cycleEst` appears
  **9 times** in the file. That is `9256cf7`, *"cycle-accurate timing wired into
  the machine, opt-in, ~6x"*.
- Lite's copy has **zero** references to `i8088-timing`, `CycleEstimator` or
  `_cycleEst`. Line 44 is `import { I8251 } from './i8251.js';`.

So lite did not merely fall behind on this — it **removed** the feature, and the
removal predates the allow-list that was supposed to record exactly this. It is a
deliberate-looking excision with no recorded decision behind it.

This is the constraint that decides the merge:

**A merge of `i8086-machine.js` toward master reintroduces an import of
`./i8088-timing.js`, which does not exist in lite.** Either the merge drops that
import and the nine `_cycleEst` call sites with it (preserving lite's shape), or
the two MISSING files must be vendored in the same commit — and
`i8088-timing.js` imports `TABLES, PROVENANCE` from `i8088-cycles.js`, so that is
**983 KB of new bundle**, 975 KB of it one table file, for an opt-in feature lite
does not expose.

*Falsifiable, three ways: `grep -c _cycleEst` is 9 upstream at `9500cf9` and 0 in
lite; `git show 88bbdcf78:src/i8086-machine.js | grep -n i8088-timing` shows the
import already present at the pin, so this is not upstream drift; and
`git show 9500cf9:src/i8088-timing.js | grep ^import` shows the 975 KB
`i8088-cycles.js` dependency. If any of those reads differently, this section is
wrong.*

**Recommendation:** drop the import in the merge and add a tenth entry to the
allow-list saying so, with the reason. Vendoring 983 KB to light up an opt-in
timing mode is a separate decision that deserves its own row and its own owner —
it is not something a pin move should carry in silently.

**The five other allow-list files — `z80-machine.js` (4), `m6502-machine.js` (5),
`z80-debug.js` (5), `m6502-debug.js` (7), `emu8051-adapter.js` (2).** All AHEAD.
Their forward-ports are the checkpoint capture/restore paths and the replay-input
and input-listener hooks the recorder subscribes to.

*Falsifiable: each is byte-identical between the pin and master, so upstream has
changed nothing to gain. Syncing them can only remove.*

**The seven debugger-lane files** — `avr8js-debug`, `debug-session`,
`debug-target-factory`, `emu8051-debug`, `i8086-debug`, `m6502-debug`,
`rp2040js-debug`. All AHEAD. **The direction call on these is the debugger lane's,
not ours**: they own the recording, inspection and replay layer these files
implement, and four of the seven are considerably larger in lite than upstream
(`i8086-debug` 52,012 vs 37,761 bytes; `emu8051-debug` 42,908 vs 30,409).

*Falsifiable: same test — pin equals master for all seven, so there is nothing
upstream to gain by syncing them.*

**`reseat-gate.js` — AHEAD, and the one row I would not act on without a reader.**
It is *smaller* in lite (8,112 vs 10,481 bytes) while classified AHEAD. That is
consistent with a deliberate trim, and also with a truncation nobody noticed.

*Falsifiable: diff it. If the missing 2.4 KB is upstream work lite never had, the
classification is right and the label "AHEAD" is still misleading.*

## The two MISSING files

`i8088-cycles.js` (974,864 bytes) and `i8088-timing.js` (7,947) exist upstream at
**both** the pin and master, and not in lite at all. They are not stale — they were
never vendored. A `--only` list will not add them; a full sync would, and the first
is nearly a megabyte. They are not idle curiosities — master's
`i8086-machine.js` imports one of them, which is what makes the MIXED merge above
a decision rather than a mechanical three-way.

*Falsifiable: `git show 88bbdcf78:src/i8088-cycles.js | wc -c` is non-zero and the
lite path does not exist at `origin/main`.*

## Master has moved since the request

The ask named master as `7b40c10`; it is now `9500cf9`. Nine files began differing
between those two shas. This document measures against `9500cf9`; re-run before
acting if master moves again.
