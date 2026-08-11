# brickwright-lite — roadmap

Everything known to be pending, in one place, with the measurements that were expensive to
obtain. Two rules for this file:

- **Each entry carries its evidence.** Numbers, not impressions. An item that says "feels cramped"
  costs its next reader a day; one that says "the rail pins the editor's min-content at 776px"
  costs them nothing.
- **Cross-reference, do not copy.** `BLOCKED.md` is bw-bundle's own log and stays authoritative
  for its items; the long-horizon hardware tracks live in `CLAUDE.md`. This file points at both.

Ownership: **owner** is the human; **bw-bundle** is the agent that owns CI guards, bundle budget,
vendoring (bw-board, sb3-creator, WASM pinning), extension conformance and deploy verification.
bw-bundle is on a quota pause until **2026-08-15**, so items marked with it are unowned in
practice until then.

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

### 3.1 Code-tab debugger strip — OPEN, **bw-bundle**
Run/Sim live in the Circuit tab; Pause/Step appear once a program starts; the Code tab has no
debugger controls at all. Placement is approved — a strip under the Circuit tab bar, shared runner
via `vm.runtime.bwDebugRunner`. Not started. See `BLOCKED.md`.

### 3.2 Pane-slots full routing — DEFERRED
The reducer models `upper`/`lower` content slots per column; `gui.jsx` reads only `.size`. The
content swap works. Full slot decomposition was judged not worth the risk (it would mean breaking
Scratch's `<Tabs>` apart). See `BLOCKED.md`. The `PaneColumn` renderer written for it is gone
(§1.1) — it was ~40 lines of flex divs and cheap to write again if this is ever revived; what
would be expensive is the `<Tabs>` decomposition, and that was never started.

### 3.3 Long-horizon tracks — NOT STARTED
All specified in `CLAUDE.md`; not repeated here.
- **`stc12live`** tethered extension — blocked on chip-side firmware (`10-live-firmware`), step 2
  of `stc/docs/ROADMAP.md`. The compiled path (`generateC()`) is done; the flashing path is not.
- **On-device TTS** — replace cloud AWS text2speech with CrispASR's WASM engines (MIT). Needs
  COOP/COEP, which interacts with the gallery fetch.
- **Hardware visualisation surface** — S4A-style live board view, simulated and live, riding the
  existing `RUNTIME_EXTENSIONS` driver contract (no emitter changes).
- **Simulator / debugger view** — `emu8051` is MIT and can ship here; ucsim/QEMU/unicorn are GPL-2
  and can never be bundled. No ucsim build ships an STC model.

---

## 4. Standing debt

**Dead-module ratchet** (`test/no-dead-overlay-modules.test.mjs`) — **five** entries, and the list
may only go down. One is ours: `lib/flyout-resize.js`, which bridges the pane size vocabulary to
Blockly's flyout for the LEFT column and has no caller because only the right column is sized
today. Four are vendored bw-circuit-ui modules used only by its standalone demo.
`components/gui/pane-column.jsx` came off the list in §1.1.

**Attribution wart** — the `project-data.js` rotation-centre fix was swept into `333fae8`
("vendor bw-circuit-ui") by a concurrent `git add -A`. Content is correct and verified; only the
attribution is wrong. Not worth rewriting under another active session. Recorded so the commit
log's oddity has an explanation.

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
