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

### 1.2 Properties rail reserves width globally — NOT REPRODUCIBLE (measured 2026-08-28)
Measured before touching anything, which is the only reason the CSS was not rewritten for nothing.
`npm run probe:layout -- --report`, editor column `min-content`:

| when | min-content |
| --- | --- |
| blocks tab, before the costume tab is ever opened | 250px |
| costume tab, rail **closed** | 776px |
| costume tab, rail **open** | 776px |
| back on the blocks tab | 250px |

Both halves of the original claim are wrong. **The rail costs nothing** — 776px is identical open
and shut, so it is what the paint editor's own controls need, not what the rail reserves. And the
floor **does not persist**: an unselected tab panel is `display: none` (`gui.css` `.tab-panel`),
and a `display: none` subtree contributes no min-content at all. `forceRenderTabPanel` keeps panels
MOUNTED, which is not the same as keeping them LAID OUT — that conflation is where the claim came
from.

So the proposed fixes (overlay the rail, or move sections into a flyout) would have solved nothing.
`.rail` is already `position: absolute`; only `.rail-spacer` is in flow, and it is inside the paint
editor's own 776px either way.

Nothing to do. The numbers are printed by `--report` rather than asserted, because 776px is a
property of today's paint toolbar and a threshold would just freeze it.

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

### 2.0 Vercel deploys manually and nightly — LANDED 2026-08-28, know the rule

Vercel's Git integration is disabled for this repository
(`vercel.json`: `git.deploymentEnabled: false`). A push, pull request, tag, or
commit-message marker therefore does **not** create a Vercel deployment.

`.github/workflows/deploy-daily.yml` is the only deployment path. It runs:

- manually through `workflow_dispatch`; and
- nightly at **02:00 Europe/Berlin**, always checking out the current `main`.

The workflow performs `vercel pull`, `vercel build --prod`, and a prebuilt
production deploy. It is serialized so a manual run and the nightly run cannot
publish over one another. The obsolete `scripts/vercel-ignore.sh` checkpoint
filter was deleted when this policy landed.

**CI still runs on every push.** Vercel does not. A PR badge therefore reports
the build and vendor gates without consuming the account-wide deployment quota.
If the public Vercel site is stale, inspect the scheduled/manual deployment
workflow rather than looking for a missing per-push deployment.

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

### 3.3 ASM tab examples — RESOLVED 2026-08-28 (`lib/bw-asm/examples.js`)
The ASM tab has a reference panel and a working assemble path but no examples, and an empty
assembly editor is a wall for anyone who has not written 8051/6502 assembly before (owner,
2026-08-14: "To make it more intuitive, we need a couple of examples in the end"). A small
per-device set — blink, button poll, a delay loop — selectable like the code-tab examples, each
one assembling green against the hosted `/assemble` before it ships.


Five programs, three shapes: drive a pin, read one, waste a measured amount of time. 8051 gets
blink / button / count, the 6502 bench and the Z80 bench get a blink each; a device with no
`/assemble` path is offered none, because a picker that loads something the ▶ button cannot
build is worse than an empty editor.

**They are gated by assembling, not by review.** `test/asm-examples.test.mjs` posts each one to
the same hosted assembler the ▶ button uses. An example that does not build leaves the reader
unable to tell whether they mistyped it or it was always wrong. The gate skips when the network
is unreachable rather than reporting a pass it did not earn, and its structural checks (both
locales, unique ids, a comment at the top, no examples for devices without a toolchain) always
run.

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

### 3.5 Circuits engine & interchange campaign — SCOPED 2026-08-23, upstream-first

The full engine/format survey (2026-08-23) produced fully-scoped work items in the
upstream repos; the engine and format work happens THERE and reaches lite by vendoring:
- **`../../bw-board/ROADMAP.md`** — items E0–E4 (correctness fixes; sparse LU +
  factorization reuse; adaptive trapezoidal transient; exponential-junction path;
  true small-signal AC; model depth; scheduled device events). mna.js items are
  gated on the `spec-updates/` files already filed there (`referenced-device-drives`,
  `sparse-lu-factor-reuse`, `adaptive-transient`, `shockley-junction-limiting`,
  `ac-small-signal`).
- **`../../bw-circuit-ui/ROADMAP.md`** — items X0–X2 (SPICE-deck export fixes incl.
  the mega/milli suffix bug; wiring the three dead exporters; SVG/PNG/CSV document
  export; SPICE-netlist import; breadboard-format and applet-text-format interchange;
  LaTeX schematic export; FFT/Monte-Carlo/parameter-stepping instruments in workers).

Lite-side items (ours, this repo):
1. **Re-vendor after each upstream landing** — `npm run sync:bwboard && npm run
   sync:circuitui`, then the bundle-grep invariant for one distinctive new symbol per
   landing (a green build does not prove the feature is in the bundle).
2. **Vendor the format-knowledge attribution** — the vendored
   `bw-circuit-ui/importers/kicad-common.js` cites "THIRD-PARTY.md", which exists
   upstream but not here: copy the format-schema attribution rows (incl. the MIT
   schema-knowledge source for `.kicad_sch` tokens) into `THIRD-PARTY-NOTICES.md`'s
   bw-circuit-ui section so the vendored pointer resolves.
3. **Extend the trademark disclaimer** — README §"Not affiliated" names Scratch/MIT,
   STC, Arduino, Raspberry Pi but none of the EDA format names the import/export UI
   shows; add them (and mirror in `docs/app-store-metadata.md`). Rule stays: format
   names in import/export UI are nominative use; competing products are never named
   in committed content (bw-board `PLAN.md` standing rule).
4. **Licence tripwire** — extend the dependency check so the LGPL sparse-solver
   family (KLU/CSparse derivatives, including the sparse module inside mathjs) can
   never enter the shipped graph; the full ruling table is in
   `bw-board/ROADMAP.md` §"Backends and licence policy". The oracle policy is
   unchanged: GPL/LGPL engines are CI/dev-side oracles only.
5. **Surface the new exports in lite's Circuit tab** once vendored (schematic
   SVG/PNG save, LaTeX export, trace CSV) — menu wiring only, no logic here.
6. **Define the eleven `devices_oled*`/`devices_tft*` opcodes** the emitter emits but
   no extension copy defines (measured in §5.1a — not a vendoring lag; there is
   nothing upstream to vendor). Fix at the source of truth first
   (sb3-creator `reference/extensions/devices.js`, wrapping the display device state
   the engine already models — ssd1306/ili9341 are registered devices), then
   re-vendor lite's bundled copy. Acceptance: the static emitted-vs-defined gate in
   `test/example-vm-execution.test.mjs` goes green for the seven affected examples,
   and the three currently-inert ones (`55-oled-hello`, `72-pico-oled-hello`,
   `51-tft-pixels`) demonstrably reach extension methods.
7. **Fix the `pc84-led-herz` VCC/GND short** — `wire_9` puts `vcc_1.vcc` on `net_8`
   while three scripted `wire_fix_*` wires put `gnd_2.gnd` on the same net (verified
   by hand, 2026-08-23; the only VCC/GND short a scan of 274 examples found). Fix the
   wiring in the example, and add the rail-short check to the corpus gate so the
   class stays caught — the engine's DRC already detects it at runtime; the gate
   must catch it statically.
8. **74\*/retro example wave — OWNER-REQUESTED 2026-08-23, gated, examples-owner's
   lane.** The engine's retro tier is barely tapped by the corpus (~14 of 236
   examples): instruction-level 6502/Z80/6507 cores booting real ROMs, ~34
   register-level bus-peripheral models (VIA/ACIA/VDP/CRTC/RIOT/PSG/UART/ULA,
   memories as byte arrays), a bus extractor that derives the machine FROM THE
   DRAWN WIRING at all 65536 addresses (contention and open vectors refused with
   addresses named), and the 74HC family as electrical devices. A wave of
   logic-glue and retro benches is wanted. TWO GATES, in order: (a) `PLAN.md`
   Milestone 0's own rule — no new content wave while the predecessor's review
   debt is open (the verification-debt ledger is the critical path); (b) the
   engine enablers in `bw-board/ROADMAP.md` §E5 + E4.1a (gate propagation delay
   is the single biggest space-widener: ring oscillators, hazard demos, honest
   flip-flop timing). Authoring itself belongs to the examples owner and rides
   the strengthened gates (corpus execution, KCL residual, rail-short,
   net-coalesce warnings).

---

## 3b. What an extension can reach — **CONTENT PINNING + URL SANDBOX SHIPPED** (2026-08-28)

Full reasoning, and the verification behind each claim, in
`docs/EXTENSION-SECURITY.md`. Summary and evidence here so the roadmap is not
missing a security track that exists only in another file.

**The boundary.** Exact gallery URLs run in-process only after their fetched
bytes match the app's reviewed pin. Every unpinned URL runs in a worker without
DOM, editor-runtime or Tauri-bridge access; its dispatch channel accepts only
that worker's extension registration lifecycle and replies to calls actually
sent to it. Unknown HTTP(S) URLs still require confirmation and retain network
access; changed pinned URLs are refused.

The remaining ambient native surface belongs only to reviewed, content-pinned
compatibility extensions. A JavaScript wrapper cannot attribute calls made in a
shared page realm; real per-extension Tauri capabilities need an identity-bearing
broker or unforgeable session tokens checked in Rust.

| # | Task | Why this order |
|---|---|---|
| 1 | **Pin the gallery by content, not host — SHIPPED** | All 120 current entries have exact served-byte hashes tied to an immutable reviewed repository commit. The VM verifies before evaluation; only exact pinned URLs skip confirmation. |
| 2 | **`allowedServices`** | An extension may only touch GATT services it declared. The reference enforces this BEFORE the blocklist; we shipped only the blocklist. Observe-only first, then default-on with a confirmed override. |
| 3 | **Native capabilities declared, not ambient** | Remaining least privilege for reviewed pinned code; requires caller attribution at a real broker/Rust boundary, not a mutable page-global wrapper. |
| 4 | **Sandbox unpinned URLs — SHIPPED** | Arbitrary URL code runs in a restricted worker; the central dispatch broker blocks forged main-service calls and cross-worker replies. |

**Not an App Store item.** Guideline 2.5.2 permits code run by
WebKit/JavaScriptCore, and Scrub — a Scratch *web browser* that also bridges
arbitrary pages to Bluetooth — has shipped since 2021 (id1569777095). An earlier
worry in this session that review might object was overstated. Do this because
it is right.

Each task is independently shippable and none blocks the next.

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

## 5. Cross-repo gates that cannot fire in CI — **CLOSED 2026-08-28**, re-measured

Both defects below are fixed. Re-measured on 2026-08-28 by comparing lite's own emitter
against lite's own extensions — no second checkout, which is the point of the fix §5.1a made.
**The numbers, so nobody has to derive them again:**

```
stc12    emitter names 31 opcodes, extension defines 30, emitted-but-undefined: 0
devices  emitter CREATES 36,      extension defines 48, emitted-but-undefined: 0
         all eleven devices_oled*/devices_tft* opcodes are present
gate     test/example-vm-execution.test.mjs — 290 pass, 0 fail, 0 skipped
```

The one apparent survivor is instructive and is NOT a gap: `stc12_readpin` is named by the
emitter but defined nowhere. Every one of its four references is a **read** —
`b.opcode === 'stc12_readpin'` in a lowering path — and nothing constructs a block with it.
The extension defines `stc12_read`, which is the opcode actually produced. That is this
section's own rule (*check what is emitted, never what is mentioned*) applied back to itself;
a grep for the name alone would have reported a defect that does not exist.

The history below is kept because the METHOD is worth more than the verdict, and because
§5.1a's "gate it inside one repo so it cannot skip" is the pattern to reach for the next time
a check needs two checkouts.

### 5.1 The stc12 extension lite ships is missing 8 opcodes the emitter emits — FIXED

A gate that needs two checkouts side by side runs on a developer machine and **skips in CI**, where
only its own repo is cloned. It then reports as a pass forever. This is the `SKIP`-reads-as-success
failure from §"Working rules", promoted here because it is currently hiding a shipped defect.



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

### 5.1a AMENDED 2026-08-23 — the count above is wrong, and the gap is wider than stc12 (both halves now FIXED)

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
- **`grep` silently skips a file containing a NUL byte, and absence-by-grep is the unsound
  direction.** `bw-board/board.js:1412` builds a composite key as `` `${partId}\0${verb}` ``. GNU
  grep sees the NUL, classifies the whole file as binary, and searches nothing — no error, and no
  "Binary file matches" once the output is piped or counted. `grep -rn setDeviceControl overlay/`
  therefore reports zero definitions of a method defined at line 1376. Detect it with `file <path>`
  (it says `data`); `grep -a` and `readFileSync` both work. The dangerous direction is asserting a
  string is ABSENT: presence-by-grep merely misses, absence-by-grep silently succeeds. Worse, this
  file gained the NUL in the SAME commit that added the symbol (`6f8d11c5c`), so any grep-based
  absence check on it went from true-negative to permanent false-negative in one step — a gate that
  cannot fail, arriving without anyone touching the gate.
- **Pin a belief as a test, or it decays silently.** A test that asserts an absence has to
  re-establish it on every run; a grep establishes it once, at the moment you form the belief, and
  never again. That difference is why an absence pinned as a test went red the day
  `setDeviceControl` appeared, with an actionable message, while the same absence held as a
  remembered grep result survived the change and was still being repeated to other sessions hours
  later. The actionable half is the corollary: when you find yourself believing something about
  the code — this method does not exist, nothing calls that, only these kinds are addressable —
  that belief is cheap to pin and expensive to leave unpinned.
- **When a result reverses, ask whether the SUBJECT moved before blaming the instrument.**
  2026-08-23: a finding that twelve extension actuators guarded on a board method defined nowhere
  was correct at `3e87340f5` (0 mentions, no NUL). Re-measured after `6f8d11c5c` it read the same
  way for a different reason, and the retraction — issued to three sessions — destroyed a true
  result. "Verify the instrument" does not catch this one; the tree changed underneath. Record the
  sha a measurement was taken at, and diff the subject before revising the conclusion. Corollary:
  **two agents agreeing is not two instruments agreeing.** Corroboration requires a different
  METHOD, not a different person — the same day produced a bench count of 1092 offered as
  confirmation of a circuit count of 1034.
- **`board.resistance(a, b)` is directional by design.** `b` becomes the solver reference and gnd
  symbols are deliberately inactive for the solve (`mna.js` ~313 and ~373), so that a dangling gnd
  cannot become a shunt path in the T-network test. Consequence: probing with ground as `a`
  fragments the network. Measured on 22-series-parallel, power off: `resistance(+, -)` = 2191.60 Ω,
  `resistance(-, +)` = 333 MΩ, while a non-ground pair is symmetric (470.0 Ω both ways). Probe
  ground-as-`b`, or a whole circuit reads as an open one. Found by bw-lessons, reproduced here.
- **Disk fills silently and looks like a git bug.** 2026-08-22: `git worktree add` failed with
  "No space left on device" at 219 MB free; two abandoned lite worktrees held 2.2 GB. Full lite
  checkouts are ~1.1 GB each. Use `git worktree add --no-checkout` + `git sparse-checkout set docs`
  for doc-only work, and prune worktrees whose HEAD is merged and whose tree is clean.
