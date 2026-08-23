# brickwright-lite — roadmap

Everything known to be pending, in one place, with the measurements that were expensive to
obtain. Two rules for this file:

- **Each entry carries its evidence.** Numbers, not impressions. An item that says "feels cramped"
  costs its next reader a day; one that says "the rail pins the editor's min-content at 776px"
  costs them nothing.
- **Cross-reference, do not copy.** `BLOCKED.md` is bw-bundle's own log and stays authoritative
  for its items; the long-horizon hardware tracks live in `CLAUDE.md`. This file points at both.

Ownership: **owner** is the human. Named agents (**bw-bundle**, **bw-board**, **bw-cui2** …) were
long-lived VPS sessions that owned CI guards, bundle budget, vendoring, extension conformance and
deploy verification.

**Fleet status, measured 2026-08-22: nine of twelve of those sessions are gone** — `Killed` by the
VPS OOM killer, their `exec bash` guard leaving a shell where the agent was. Only `mbit-fw`
(holding), `ucsim-stc` (idle) and `embed-lang` survive. **Treat every agent name in this file as
an unowned label, not a live owner.** A revived session is a fresh context that knows only what is
written down — which is the whole reason this file and `PLAN.md` must stay true. Do not assume any
item marked with an agent name is being worked on.

---

## 1. Costume designer & GUI layout

### 1.1 Collapsed stage column is a clipped stage, not a strip — RESOLVED (`pane-strip.jsx`)
Collapsing showed 28px of live stage: a fragment of the green flag, a sliced sprite, two orphaned
letters from the sprite panel — the same thing reported as "broken/nonsensical" about the old `xs`
step of the cycling button. The divider changed how that state was reached, not what it looked
like.

`pane-strip.jsx` now covers the collapsed column with a labelled, clickable strip. It covers
rather than replaces: `StageWrapper` stays mounted underneath, because unmounting it would take
scratch-render's canvas with it and make restoring a remount. Verified by probe — the canvas
backing store stays 480px wide throughout, and clicking the strip restores 28px → 725px.

Retired `pane-column.jsx` from the ratchet in the same commit (§4).

### 1.2 Properties rail reserves width globally — OPEN
The rail reserves 15rem (11rem narrow). The number that matters is downstream of that: **opening
the rail raises the editor column's `min-content` to 776px**, and because the tabs render with
`forceRenderTabPanel` every panel stays mounted once visited, so that floor **persists on the
blocks tab and everywhere else**. A flex item cannot shrink below its min-content whatever its
flex-basis says, so this caps the pane divider at ~90px of travel and constrains the whole row.

Options: overlay the rail instead of reserving for it, or move sections into a flyout. Measure
again after either — `npm run probe:layout -- --report`.

This is also a trap for anyone testing layout: run drag measurements **before** the costume tab is
ever opened, or they measure the rail's floor and it looks exactly like a flex-grow dilution bug.
`scripts/probe-layout.mjs` enforces the ordering and says why.

### 1.3 Grey band at the robot's feet — RESOLVED (155fc7f + 333fae8)
Was not a viewport bug: paper's view measured 521x606 against a 521x606 element at dpr 1, an exact
match. The two costume SVGs were replaced in place by branding, keeping the cat's rotation centres
(48,50)/(46,53) on 220x260 robot artwork centred at (110,131.5). The art board is positioned on
the rotation centre, so it slid up until its bottom edge crossed the canvas. Same cause also made
`turn 15 degrees` swing the robot around its shoulder and put a sprite at x:0 y:0 off centre.
Guarded by `test/default-costume-centre.test.mjs`.

### 1.4 Draggable pane divider — RESOLVED (77e6789)
Replaced the cycling debug button. A named size is a share that grows into free space; a dragged
size is a number 0..1 rendered with `flex-grow: 0`, because a share also takes a cut of the free
space and the first version moved the boundary 90px for a 220px drag. Double-click is detected
from pointerdown timestamps: the `preventDefault` that stops a drag selecting text also suppresses
`dblclick`, which never fired once in Firefox.

### 1.5 Stage-size buttons now fit the column to the stage — RESOLVED (`FIT` in pane-sizes.js)
The buttons used to step the column between the `s` and `m` shares, which was an estimate of how
much room a stage of that size wants and a poor one. Measured at 1600px: a small stage needs a
258px column and got 630px; a large stage needs 498px and got 725px. "Switch to small stage" is a
request for editor room, and it was handing over 95px of the 372px available.

The column is now `flex-basis: min-content` (the `FIT` size), so it is exactly as wide as the
stage and sprite pane need. `min-content` rather than a pixel table because the stage is 480px
scaled by 1, 0.85 or 0.5, and a table would need keeping in sync with all three. Editor at small
stage: 866px → **1333px**.

Note: restoring from the collapsed strip still goes to the `m` share (725px), not `FIT`. That is
the documented default rather than an oversight, but a one-word change if the snug width is wanted
there too.

---

## 2. Deploy and CI

### 2.1 Deploy starvation with two agents pushing — OPEN, do not redo naively
Workflow is on stock `concurrency: {group: pages, cancel-in-progress: false}`. With two sessions
pushing, runs are cancelled while queued and the site lags several commits, arriving out of order.
Observed again on 2026-08-10: run for `155fc7f` was cancelled by a newer push.

**A previous per-job split took the site down** — the Pages artifact is a single shared name, so an
interleaved build published a mismatched tree (index.html naming 404 chunks). If retried: per-run
artifact name, or a concurrency group keyed on the commit, and prove it somewhere other than this
repo.

### 2.2 Service-worker failure-mode tests — OPEN, **bw-bundle**
Playwright tests for chunk 404, fetch timeout, and stale entry vs fresh chunks. The white-screen
bug (9886889) was found by hand; these catch the class. Identified in `BLOCKED.md`, not built.

Note for whoever builds them: `respondWith` rejects if its promise resolves to `undefined`, which
is what produced the white screen. Cache renaming is the only way to recover an already-poisoned
browser, since `activate` deletes non-current caches.

### 2.3 playwright must not reach package-lock.json — RESOLVED (c1692f0), but standing hazard
`package-lock.json` is tracked now. `npm i -D playwright --no-save` spares `package.json` and
rewrites the lock anyway, and a concurrent `git add -A` committed playwright as a root dependency
the root `package.json` does not declare. Run `git checkout package-lock.json` after installing;
`scripts/probe-layout.mjs` says so in its header.

---

## 3. Hardware / debugger surfaces

### 3.1 Debugger surface — LARGELY RESOLVED (2026-08-21 tranche), verify before reopening
`debug-panel.jsx` exists and the 2026-08-21 regression pass landed dock controls, right-dock
opening the optional pane without remounting, and browser proof that the debugger keeps running
while hidden and across view/dock changes (`5e044cf03`, `062f57290`, `c15b75cf1`).

What this entry claimed — "the Code tab has no debugger controls at all", "not started" — is no
longer the measured state. Anyone reopening it must re-measure first and say what is missing, in
the file's own evidence style. The remaining question is coverage, not existence: which surfaces
still lack run control, and does Milestone 5's "one run and debug model" (see `PLAN.md`) subsume
this entry entirely? If it does, delete this section rather than maintaining it twice.

### 3.2 Pane-slots full routing — DEFERRED
The reducer models `upper`/`lower` content slots per column; `gui.jsx` reads only `.size`. The
content swap works. Full slot decomposition was judged not worth the risk (it would mean breaking
Scratch's `<Tabs>` apart). See `BLOCKED.md`. The `PaneColumn` renderer written for it is gone
(§1.1) — it was ~40 lines of flex divs and cheap to write again if this is ever revived; what
would be expensive is the `<Tabs>` decomposition, and that was never started.

### 3.3 ASM tab examples — OPEN
The ASM tab has a reference panel and a working assemble path but no examples, and an empty
assembly editor is a wall for anyone who has not written 8051/6502 assembly before (owner,
2026-08-14: "To make it more intuitive, we need a couple of examples in the end"). A small
per-device set — blink, button poll, a delay loop — selectable like the code-tab examples, each
one assembling green against the hosted `/assemble` before it ships.

### 3.4 Long-horizon tracks — NOT STARTED
All specified in `CLAUDE.md`; not repeated here.
- **`stc12live`** tethered extension — blocked on chip-side firmware (`10-live-firmware`), step 2
  of `stc/docs/ROADMAP.md`. The compiled path (`generateC()`) is done; the flashing path is not.
- **On-device TTS** — replace cloud AWS text2speech with CrispASR's WASM engines (MIT). Needs
  COOP/COEP, which interacts with the gallery fetch.
- **Hardware visualisation surface** — S4A-style live board view, simulated and live, riding the
  existing `RUNTIME_EXTENSIONS` driver contract (no emitter changes).
- **Simulator / debugger view** — `emu8051-stc` is MIT and can ship here;
  `CrispStrobe/ucsim-stc` is our GPL-2 oracle and remains CI/local-only.
  `avr8js` is the shipped AVR path; `simavr` is an external AVR hardware
  oracle. The MIT `cemeyer/avr-emu` and `Gregwar/avrel` projects are optional
  CPU/reference cross-checks only, not board runtimes.

---

## 4. Standing debt

**Dead-module ratchet** (`test/no-dead-overlay-modules.test.mjs`) — this entry said **five**
entries and "the list may only go down". Measured 2026-08-22: **sixteen**. The ratchet did not
fail; the claim about it did, and nobody noticed because a growing exclusion list still shows
green.

Worse than the count is the shape. **Eleven of the sixteen are of the form "vendored; wired when
X lands"** — `avr-peripherals.js` (AVR debug), `face-live.js` (tethered hardware),
`m6507-machine.js` (Atari 2600 / SBC6507), `m74c922.js` (keypad part), `blinkenrocket-modem.js`
(firmware upload), `zx-tzx.js` (ZX tape loading), plus the bw-circuit-ui demo modules and the
`sdcc-wasm` dist bundles.

**That is a roadmap hiding in a test's exclusion list.** Six future device/hardware features are
recorded nowhere else in this repo: not in this file, not in `PLAN.md`. A reader of the planning
docs cannot see them, and a reader of the test file sees them as noise to scroll past. Either
promote each to a tracked item here (with the evidence rule applied — what would it take, what is
it blocked on) or delete the vendored file until its feature is real. An exclusion that says
"later" with no owner and no date is a to-do with a green checkmark on it.

The one genuinely ours remains `lib/flyout-resize.js`: it bridges the pane size vocabulary to
Blockly's flyout for the LEFT column and has no caller because only the right column is sized
today. `components/gui/pane-column.jsx` came off the list in §1.1.

**Attribution wart** — the `project-data.js` rotation-centre fix was swept into `333fae8`
("vendor bw-circuit-ui") by a concurrent `git add -A`. Content is correct and verified; only the
attribution is wrong. Not worth rewriting under another active session. Recorded so the commit
log's oddity has an explanation.

---

## 5. Cross-repo gates that cannot fire in CI — OPEN, highest priority

A gate that needs two checkouts side by side runs on a developer machine and **skips in CI**, where
only its own repo is cloned. It then reports as a pass forever. This is the `SKIP`-reads-as-success
failure from §"Working rules", promoted here because it is currently hiding a shipped defect.

### 5.1 The stc12 extension lite ships is missing 8 opcodes the emitter emits — LIVE DEFECT

Measured 2026-08-22 on a machine with both checkouts:

```
sb3-creator emits            28 stc12_* opcodes  (derived from sb3Creator.js, not hand-listed)
lite's bundled extension     20 blocks           overlay/scratch-vm/src/extensions/crispstrobe/stc12/index.js
sb3-creator reference copy   30 blocks           reference/extensions/stc12.js  — has all 28
```

Missing from the copy lite ships, present in the reference:

`stc12_whenkey` · `stc12_seg_shownum` · `stc12_seg_showdigit` · `stc12_seg_setsegs` ·
`stc12_seg_clear` · `stc12_led_set` · `stc12_led_only` · `stc12_keypad`

**One** shipped gallery example emits them: **`79-a2-sampler`** (`DEVICE STC89C52RC`, which uses
the same `stc12` extension id). This entry first said three, naming `77-keypad-keyshow` and
`78-a2-calculator` too. That was wrong, and wrong in an instructive way: it came from grepping the
`.bw` sources for verb *text*, which finds the words without establishing that they lower to those
opcodes. Transpiling each example to `.sb3` and reading the emitted opcodes shows only
`79-a2-sampler` producing `stc12_keypad`, `stc12_led_only`, `stc12_seg_clear`, `stc12_seg_shownum`
and `stc12_whenkey`. Check what is emitted, never what is mentioned.

Two independent methods agree, which is why this is stated as fact and not suspicion: executing the
bundled extension's `getInfo()` yields 20 blocks, and grepping the file finds those opcode strings
absent entirely. The device-gating trap was checked and excluded — gating in that file uses
`hideFromPalette`, which keeps a block defined; these are not defined at all.

**What the app does with an undefined opcode — measured, and the answer is nothing.** The project
loads clean. The VM pushes the block as an operation and the GUI does not assert on the unknown
type in the path that matters; every layer fails quietly. There is no downstream layer that will
complain on a learner's behalf, which is exactly why the fix had to put the opcodes into the
shipped extension rather than rely on an error surfacing.

**FIXED** — the bundled extension now defines all 28 emitted opcodes (20 blocks -> 30).

### 5.1a AMENDED 2026-08-23 — the count above is wrong, and the gap is wider than stc12

Now measured by a gate that runs in lite's own CI on every push
(`test/example-vm-execution.test.mjs`), so this no longer depends on a second checkout being
present. Full detail: `docs/EXAMPLE-CORPUS-FINDINGS.md`.

- **One example is affected by the stc12 gap, not three.** `79-a2-sampler` authors
  `stc12_whenkey`, `stc12_keypad`, `stc12_seg_shownum`, `stc12_seg_clear`, `stc12_led_only`.
  `77-keypad-keyshow` and `78-a2-calculator` author only `stc12_setport` and `stc12_tableindex`,
  and the bundled extension defines both. What those two hit is a *referee* limitation — lite's
  trace oracle does not speak `stc12_setport` — which is a different problem with a different fix.
  Worth correcting because the §5.1 count is what decides how urgent the re-vendor is.
- **A second, unrecorded instance of the same shape, affecting seven more examples.** The emitter
  emits eleven `devices_oled*` / `devices_tft*` opcodes and **neither lite's bundled `devices`
  extension nor sb3-creator's `reference/extensions/devices.js` defines one of them.** Both copies
  stop at the LCD verbs. Unlike the stc12 half this is not a vendoring lag — there is nothing
  upstream to vendor. Affected: `55-oled-hello`, `70-calculator`, `70-calculator-simple`,
  `72-pico-oled-hello`, `73-voltmeter`, `75-battery-tester`, `51-tft-pixels`. Three of them reach
  no extension method at all, so the thing the example exists to show does not happen.
- **The open question is answered for node, not for the browser.** With the bundled extension
  registered, `vm.loadProject` neither drops the blocks nor fails: 79-a2-sampler loads all 51 of
  its blocks and the undefined ones are simply never dispatched. But node's `sb3.js` keeps
  unknown-prefix blocks where the browser drops them, so the browser answer still needs a headless
  browser run. That is why the gate covers this class STATICALLY — comparing emitted opcodes
  against the bundled extension's `getInfo()` and methods — rather than by watching the VM.
- **The general fix §5.1 asks for, applied.** Option (a): the comparison now runs entirely inside
  lite, between lite's emitter and lite's extensions, so both inputs are always present and the
  gate cannot skip. sb3-creator's `test/stc12-conformance.test.mjs` still carries
  `skip: availableCopies < 2` and still reads as a pass in its own CI; that one is unfixed.

**Why CI never saw it.** `test/stc12-conformance.test.mjs` finds copies at
`../../lego/brickwright-lite/…` (bundled), `../../extensions/…` (gallery) and in-repo (reference),
and carries `skip: availableCopies < 2`. sb3-creator's CI clones only sb3-creator, so exactly one
copy exists and the test skips with "need two copies to compare" — indistinguishable, in a green
run, from a comparison that passed.

**The general fix, which matters more than this one bug:** a cross-repo gate must either (a) check
out its sibling in CI, or (b) vendor a pinned snapshot of what it compares against so the
comparison is always possible, or (c) fail — not skip — when its inputs are absent, on the grounds
that a gate nobody can run is a gate nobody should trust. Pick per gate and write down which.
Audit the other cross-repo gates for the same shape before assuming this is the only one.

## 6. Schematic corpus gates — LANDED 2026-08-21, know what they do and do not cover

`scripts/render-schematic.mjs` + `test/schematic-*.test.mjs` now render every
`circuit*.json` — **1,034 variants** — and fail the build on non-zero wire/symbol crossings or
symbol overlaps. Reviewed byte-stable SVG baselines live in `docs/schematic-baselines/`.

Know the boundary, because the campaign that built these already tripped over it once: an earlier
246-file pass covered only each example's *default* circuit and checked size/overlap, and a Pico
motor example exposed that it never asked whether a wire crossed a foreign symbol or whether a
terminal met the artwork it named. The current gate covers **mechanical legibility** across all
variants. It does not assert that a schematic is *electrically* the same circuit the simulator
solves. That is the next gate, not a solved problem.

---

## Working rules that keep costing people time

- **Measure layout, do not reason about it.** `npm run probe:layout` (Firefox, the browser this is
  actually used in). Four layout fixes were shipped wrong by reading CSS before it existed. Add an
  invariant for every layout bug fixed.
- **Check the version badge before believing a bug report.** Click the commit next to the logo.
  Three rounds of "still broken" were builds that predated the fix.
- **Stage explicit paths.** Other sessions share this checkout and run `git add -A`.
- **`$grid-unit` is scratch-paint only**; scratch-gui's `units.css` has `$space`.
- **Node cannot reproduce the extension-block deserialization bug** — that class needs a headless
  browser test.
- **A skip is not a pass, and neither is a green cross-repo gate.** §5 is the standing example.
  When a test can only run in some environments, make it say so loudly in the environment where it
  cannot — a silent skip is the most expensive kind of green.
- **Verify the instrument before believing the measurement.** Three false readings in one day
  (2026-08-20) came from trusting an unverified rig: a mutation applied through a sibling symlink
  never reached the module the import resolved to and made a good test look vacuous; an A/B run
  imported its "before" side from a second worktree whose device registry was never populated, so
  the measured diff was the missing registry and a whole blast-radius report (44 circuits, a
  battery tester reading 0 mV) was pure artifact. When a result is dramatic, check the rig first.
  A second checkout is a second registry, a second everything.
- **Disk fills silently and looks like a git bug.** 2026-08-22: `git worktree add` failed with
  "No space left on device" at 219 MB free; two abandoned lite worktrees held 2.2 GB. Full lite
  checkouts are ~1.1 GB each. Use `git worktree add --no-checkout` + `git sparse-checkout set docs`
  for doc-only work, and prune worktrees whose HEAD is merged and whose tree is clean.
