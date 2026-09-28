# bw-bundle — blocked items (campaign: circuit parity)

## OPEN — the SPIKE arena gate is decided by two independently scheduled clocks (2026-09-28)

`scripts/verify-lego-spike-roundtrip.mjs` failed once in CI with

    the reference solution did not pass in the browser: fail "Mission failed: time is up after 15 s."

on a mission whose budget is 15 s (`rb07-stop-at-the-line` or `rb09-cliff-wall`;
the eleven rover missions run 10-40 s). The reference solution is the one the
arena itself ships, so a fail is either a real regression or a race.

**It is a race between two clocks that nothing synchronises:**

  - the arena's own `timeMs` advances from requestAnimationFrame deltas,
    `Math.min(MAX_FRAME_MS, now - lastFrame)` with MAX_FRAME_MS = 100
    (spike-arena-pane.jsx:24,186);
  - the robot's travel does NOT come from that clock. `ArenaHubBridge` reads
    `motors[port].position` — encoder degrees — which the VM accumulates on its
    own scheduling.

So under load the two drift apart, and WHICH WAY IS NOT OBVIOUS: starve the
frames and sim time runs slow while the motors keep turning, which makes a
mission easier; starve the VM while rAF keeps firing and the clock runs out
under a robot that has not moved, which makes it fail. One observed failure does
not say which happened, and this note deliberately does not guess.

**Not investigated further here because the fix is a design decision in this
lane's feature**, not a repair: either drive the arena from the VM's notion of
elapsed time, or step the VM from the arena, so that one clock governs both. A
gate whose verdict depends on runner load will redden at random for everyone
until then.

**To reproduce deliberately:** run the gate against a served build under CDP CPU
throttling and vary the rate; if the verdict flips, the coupling is confirmed and
the direction is measured at the same time.


## OPEN, FLEET-WIDE: main's per-sha concurrency group lets superseded runs accumulate until they starve every PR (2026-09-28)

**Measured at 18:5x: 78 workflow runs queued, ONE in progress.** No PR in the
repo could get a verdict, and it looked from inside a lane like "CI is slow" or
"my checks are empty". `gh pr checks 466` returned nothing at all for over two
hours; the PR was fine.

**26 of the 78 queued runs were on `main`, for 13 different superseded shas.**
That is the mechanism, and it is in `.github/workflows/build.yml`:

```yaml
concurrency:
  group: ${{ github.ref == 'refs/heads/main' && format('pages-{0}', github.sha) || ... }}
  cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}
```

For a PR branch the group is per-PR and `cancel-in-progress` is true, so a new
push supersedes the old run and the queue stays at one per PR. **For main the
group is keyed by `github.sha` and cancel-in-progress is false**, so every main
push opens a NEW group that nothing will ever collapse. Main runs do not queue
behind each other — they queue *alongside* each other, without bound, and each
one holds a runner slot until it is served.

**This is not obviously a bug**, which is why it is recorded rather than
changed. The per-sha group was deliberate and the reason is in the file's own
comment: a shared `pages-main` group made each push cancel the previous one, so
main took twelve pushes in eighty minutes and got ZERO verdicts, and the
cancellations read as though somebody had stopped them. Per-sha fixes that, and
its cost is exactly what was measured today. Which failure mode is worse is a
choice about what main's builds are FOR, and that belongs to the CI lane.

**What is not a judgement call: a build for a sha that is already 13 commits
behind main cannot inform anything.** Cancelling the 21 runs whose sha was a
verified ancestor of current `origin/main` (keeping the three for the tip)
freed the queue, and that is safe housekeeping rather than a design change:

```bash
git merge-base --is-ancestor "$sha" origin/main && gh api -X POST \
  "repos/$REPO/actions/runs/$id/cancel"
```

**One run cannot be cancelled at all.** Run `34748500702` (Build, main) has been
`queued` since **2026-09-13** — fifteen days. Both `/cancel` and `/force-cancel`
refuse it with `409: Cannot cancel a workflow run that has not been queued yet`.
It holds a slot permanently and there is no API that reaches it; it likely needs
GitHub support or will age out on its own. Recorded so the next person who
counts the queue does not spend an hour on the one entry that cannot move.

**How to tell you are in this situation** rather than looking at a broken PR:
`gh pr checks <n>` is empty AND the repo-wide queue is deep. Check the queue
before debugging the branch:

```bash
gh api 'repos/OWNER/REPO/actions/runs?status=queued&per_page=1' -q .total_count
gh api 'repos/OWNER/REPO/actions/runs?status=in_progress&per_page=1' -q .total_count
```

## ~~OPEN, UPSTREAM~~ — FIXED UPSTREAM the same day: the gallery snapshot could not be attested (2026-09-28)

**`sync-gallery-pins.mjs --check` refuses, and it is right to.** It attests that
each extension the gallery SERVES equals that extension's repo source with the
known generated blocks applied and nothing else — the content claim standing
behind ~120 extensions that load unsandboxed and in-process. One fails it:

    UNEXPLAINED  CrispStrobe/legospike_turbowarp_transpile:
      served byte 108437 is not a generated block: "this.active._movementMotors = value;..."   (extensions@a7886c12)
      served byte  94548 is not a generated block: "default: // An unknown record has an..."   (extensions@4fb33f88)

**Persistent, not a mid-publish flicker.** Upstream `main` moved from `a7886c12`
to `4fb33f88` between those two readings and the same extension still fails, at a
different offset — so it is not a cache serving a stale copy, which is the
failure mode docs/FETCH-PINNING.md was written for.

**Lite cannot fix it and should not route around it.** The script resolves
upstream `main` and hashes sha-addressed bytes, so there is no pin on this side
to hold back; `--check` exits 1 rather than writing, so there is no "just
regenerate"; and adopting the snapshot anyway would vendor content that is not in
the reviewed source, which is the one thing this gate exists to prevent.

**Where it belongs:** `CrispStrobe/extensions`. Either that extension's published
bundle is built from something other than its committed source, or it is
produced by a step `sync-gallery-pins.mjs` does not model — the slug says
`transpile`, which would fit. Both offsets land in ordinary JS rather than in a
wrapper, which argues for the first.

**Effect while it lasted:** `vendor-freshness` (the `check` context) was red on
`main` and therefore on every branch. Measured on main 2026-09-28: `b2246fd85`
12:18, `30c3e781a` 12:14, `58746c0bf` 11:08 — all failure.

**RESOLVED UPSTREAM, ~90 minutes later.** `sync-gallery-pins.mjs --check` now
exits 0 and reports `DRIFT: 2 changed, 0 added, 0 dropped` — it can attest the
snapshot again, so whatever was serving unreviewable bytes has been rebuilt.
Recorded rather than deleted because the diagnosis is the reusable part: the
failure looked exactly like the stale-cache case `docs/FETCH-PINNING.md` covers,
and the thing that ruled that out was upstream `main` MOVING between two readings
with the same extension still failing at a DIFFERENT byte offset. A cache would
have cleared. That distinction is what says "wait for upstream" rather than
"re-run it".

**What actually landed it: lite #473**, `fix/spike-transpiler-fixture-4fb33f88`
— the SPIKE transpiler fixture was refreshed to the gallery pin (extensions
`4fb33f88`). So the unreviewable bytes were a fixture in THIS repo lagging the
pin, not a gallery-side rebuild as guessed above; the "wait for upstream"
verdict was right by luck, and the reusable part is still the moving-offset
test, not the attribution.


## ~~OPEN, FLEET-WIDE~~ — FIXED (`17e5b46ec`): main's `build` job had no verdict from 04:21 to 06:5x (2026-09-21)

**Nobody's unit run is being verified on `main`, and the failure does not say
why.** The `Run unit tests` step ends with:

    ##[error]Process completed with exit code 143.
    ##[error]The runner has received a shutdown signal.

with **no `not ok` line anywhere in the TAP** — the suite is not failing, the
runner is going away underneath it, roughly four minutes in and about 2,470
tests deep. Exit 143 is SIGTERM, which is what a GitHub-hosted runner reports
when its VM is reclaimed; the job's own `timeout-minutes: 30` is not reached,
so it is not the documented self-cancel this file already records above.

Measured 2026-09-21 06:0x UTC from `gh run list --workflow build.yml --branch main`:

| | |
|---|---|
| last SUCCESSFUL main `build` | `b3df0a7a`, run 35559724371, 04:05 |
| first red | `b0ebc054`, run 35560675607, 04:21 — the #238 merge |
| main `build` runs since | 3, all failure, same signature |
| `corpus`, `browser (light)`, `browser (heavy)` | green throughout |

`b3df0a7a..b0ebc054` is the real-DOS GUI lane: a 360K MS-DOS 2.0 image added
under `static/dos/` in BOTH mirrors, `i8086-dos-bench.js` gaining a `format:
'disk'` path that boots a FAT12 kernel, `debug-runner.js`,
`pseudocode-importer.jsx`, and a bw-board pin move `da2a24ed -> 00af429e`. Any
of those could be it; **this entry deliberately does not name a cause it has
not measured.** What is established is the boundary: the job was green on the
commit before that merge and has been red on every main commit after it.

**CAUSE, and it was memory.** `test/no-nul-in-text.test.mjs` reads every
tracked file and reports each NUL byte with its line and surrounding text.
`img` was not in its binary-by-role table, so the 360K MS-DOS image — tracked
twice — was scanned as TEXT, and it holds **338,112 NUL bytes** per copy.
`nulsIn` took each line number from `buf.subarray(0, i).toString().split('\n')`,
a full re-slice **per hit**: ~10^11 byte copies with a context string retained
for every one. Locally 555 MB RSS and still climbing after 138 s; on the runner,
reclaimed before the gate could print a thing.

**FIXED in two parts**, because the second is the one that matters next time: a
`disk` role, and a linear scan with a bounded report, so an unlisted binary
format now fails BY NAME in 1.85 s — naming both copies, the count, and the
remedy — which is what this gate's own header had always promised and could not
deliver. The file went from 138 s+/555 MB+ unterminated to 0.84 s/267 MB.

**What the silence was hiding:** the very first repaired run reported a real
divergence at test 2523 — `static/dos/msdos200-base.provenance.json` differing
between overlay and packages, left by a pin bump. A defect behind a defect,
which is the argument for fixing the silent one first. Run 35568697462 is green
on all four jobs.

Noted from the pin-bump lane (lite `5990c4e78`), whose own `corpus` and both
browser jobs were green on run 35565905193 and which inherited only this.

## ~~OPEN, FLEET-WIDE~~ — FIXED (`34cf38b78`): lite main had NO CI verdict from 12:00 to 13:20 (2026-08-25)

Not my lane's problem alone, which is why it is at the top: **nobody's work is
being verified on `main` right now, and the runs do not say so.** They report
`cancelled`, which reads like somebody's choice rather than a missing gate.

Measured at 12:58 UTC from `gh run list --workflow=build.yml --branch main`:

| | |
|---|---|
| last SUCCESSFUL main Build | `3ccd9bcb`, 12:00:39 |
| main Builds since | **12, every one `cancelled`**, 0 verdicts |
| main Builds today (09:18–12:47) | 28 total: 8 completed, 20 cancelled |
| `vendor-freshness` runs since 12:27 | 5, all still `queued` — never started |

Two commits that landed inside that window are cui vendors (`98e8c4c2` mine at
ac49da0, `bb3513bc` at eade8e3). Neither has a CI verdict. `bb3513bc`'s message
quotes "lite suite 1031 pass, 0 fail" — that is a LOCAL suite, and the browser
gates in `build.yml` are precisely what a local run does not cover.

**The cause is mechanical and the fix is one line.** `.github/workflows/build.yml`
triggers on every `push` to `main` with **no `paths-ignore`**, so a LANES.md-only
commit starts a full vendor→install→build→Playwright run. The fleet pushed
LANES rows about twelve times in thirty minutes today; each start supersedes the
last, `concurrency: pages-${{ github.ref }}` collapses them, and the queue behind
them starves `vendor-freshness` as well. sb3-creator's `ci.yml` already carries
`paths-ignore: ['**.md']` for exactly this reason. lite's does not.

**Done in `34cf38b78`, on the owner's instruction** — but NOT as the blanket
`**.md` sb3-creator uses. That glob would have switched off gates that can
genuinely go red here: `examples/**/intro.md` is SHIPPED (webpack copies
`examples/` into `build/`, ExamplesBrowser fetches it at runtime),
`examples/**/EXPECTED.md` and `docs/**` are TEST INPUTS, and
`THIRD-PARTY-NOTICES.md` is both a test input and a licence artifact that three
tests `readFileSync` and assert on. So the list is explicit, top-level only, and
every one of the nine names was checked rather than assumed: `grep -rl` across
`test/` and `scripts/` finds **0 actual file reads** for each, against **3** for
THIRD-PARTY-NOTICES.md — the control, deliberately left out.

`vendor-freshness.yml` got the same nine names in `5bf3d14db`, and it was the
one actually starving — five consecutive push runs `queued` and never started.
Its "every push AND nightly" header still holds: the push run checks the
vendored tree against `vendor-pins.json` (inputs: `vendor-pins.json`,
`overlay/**`, `scripts/**` — no sync script touches any of the nine), and
`paths-ignore` narrows only `push`, so the 04:17 staleness alarm is unchanged.

Proved rather than asserted, in both directions and for both workflows: the
pushes that CHANGED a workflow file started runs (`34cf38b7`, `5bf3d14d`), and
the ledger-only pushes started none.

**Workaround that does produce a verdict**, and what I used rather than
reporting an unverified landing as verified: push the current `main` sha to a
throwaway branch and `workflow_dispatch` `build.yml` on it. A branch ref has its
own concurrency group, so main's push storm cannot cancel it —
`ci/verdict-cui-eade8e3`. **It worked, on the second attempt, and the two
attempts are the whole lesson.** Run 32849665268 sat queued 26 minutes, then ran
and was cancelled 3m25s in at *Build the editor* — steps 1-15 already green,
including the overlay-vs-pin guard and the unit tests. Run 32852621714 on the
same sha (`75ccc105b`) went all 27 steps **green**, browser gates included.

So the branch trick defeats the cancelling; it does not defeat the capacity, and
a run that gets far enough to pass fifteen steps can still die without a verdict.
Anyone reading a `cancelled` as "someone chose to stop it" is reading it wrong.


## ~~Example crash~~ — RESOLVED (bw-circuit-ui 2567fa6)

Root cause: Sim on a circuit with no MCU crashed the app. Fixed by the
owner in `8f26f20` (vendoring bw-circuit-ui 2567fa6). Not browser-specific,
not an interaction artefact — the trigger was pressing Sim on a pure
circuit, which Playwright never enters. My inability to reproduce was
correct; the missing piece was the trigger.

## Vendoring responsibility

**The owner now drives bw-circuit-ui vendoring into lite directly.** Five
owner commits (`a0e2381`–`b6d8720`) vendor bw-circuit-ui from their own
machine. bw-bundle (me) steps back from vendoring bw-circuit-ui to avoid
two vendoring runs against a moving upstream — the exact pattern that
reverted three fixes earlier in this campaign.

bw-bundle continues to own: CI guards, bundle budget, bw-board vendoring,
WASM pinning, sb3-creator vendoring, extension conformance, and deploy
verification.

## OPEN: debugger visibility from the Code tab

Verified on production: Run/Sim controls are in the Circuit tab.
Pause/Step appear after a program starts. The Code tab has NO debugger
controls. **Owner: bw-bundle.**

The DebugPanel is architecturally in the Circuit tab — it needs the
board, emulator, and pin declarations, all of which load there. Surfacing
it from the Code tab requires either: (a) a shared panel component that
mounts in both tabs, or (b) a link/button in the Code tab that switches
to the Circuit tab. Option (b) is simpler and matches the "one panel, one
owner" pattern.

## RESOLVED

- ~~loadExample must fill both code AND circuit~~ — already implemented
  in circuit-tab.jsx:190 `loadExampleProgram()`. Fetches program.bw,
  parses through SB3Creator, loads project, sets vm.runtime.stc.
- ~~Slice 1: debugState.bwMs~~ — RESOLVED (ceafc8d)
- ~~Slice 3: project.stc persistence~~ — IN PROGRESS
- ~~STC89 12T timing~~ — RESOLVED (ba6e001)
- ~~Naming rule~~ — RESOLVED (b787135 + 956fab6)

## FINDING: To-blocks drops stc12 extension blocks

Headless repro (Playwright, production site):
- Textarea filled with: DEVICE/CLOCK/PIN + WHEN flag clicked + turn on/off led1 + wait
- ⇦ To blocks clicked
- Stage has 5 blocks: event_whenflagclicked, 2× control_wait, 2× math_number
- MISSING: stc12_setpin (turn on/off led1) — 0 stc12 blocks
- stc.pins is EMPTY ([]) — PIN declaration not parsed
- editingTarget is Stage (correct for stage-only project)

The loss is in the parse → generateSB3 → loadProject chain. Either:
1. SB3Creator.parse() does not extract pins from the textarea input, or
2. The stc12 extension blocks are created but vm.loadProject drops them
   because the extension is not registered before the blocks arrive

**Owner: bw-bundle.** Next step: check creator.project after parse() in
the same headless run — does it have stc12 blocks and pins before
generateSB3?

## ~~To-blocks drops stc12 blocks~~ — FIXED (e155ca1), VERIFIED

**Post-fix headless repro (production, run 31366606123):**
- Hand-built .sb3 with extensions:["stc12"] + 2× stc12_setpin blocks
- vm.loadProject → Stage has **7 blocks**, stc12_setpin **present**
- stc12 extension **loaded** (pre-loaded from declared extensions)

Pre-fix: 5 blocks, 0 stc12. Post-fix: 7 blocks, 2 stc12_setpin. ✓

Root cause: sb3.js built extensionIDs from opcodes during deserialization,
dropping blocks whose extension prefix was unknown — circular.
Fix: deserializeProject pre-loads declared extensions before parsing targets.

**bw-blocks:** your side was clean (confirmed). The loss was in
vm.loadProject's deserialization, not in sb3-creator.

## IN PROGRESS: pane-slots (gui.jsx)

**Owner: bw-bundle.**

The reducer models content slots (`upper`/`lower` per column) and gui.jsx
reads only `.size`. PaneColumn exists and is unreferenced.

**Approach decision needed:** The Scratch `<Tabs>` component hardcodes the
block palette + workspace as one TabPanel. The "code" preset wants the
pseudocode editor in the middle column instead. Two options:

1. **Decompose Tabs** — break the palette and workspace into separate
   content surfaces that PaneColumn can place independently. High risk,
   breaks the existing tab switching behavior.

2. **Content swap inside the existing TabPanel** — when the preset says
   `middle.upper === 'code'`, render the pseudocode editor in the blocks
   TabPanel instead of the workspace. Lower risk, keeps Tabs intact.

Option 2 is simpler and preserves the existing tab structure. The Code
tab already exists as TabPanel index 3 (PseudocodeImporter); the preset
would just change which TabPanel is selected, not where content renders.

**Status:** reading the structure, not yet editing gui.jsx.

---

## Wind-down note (2026-08-10, quota pause until Aug 15)

### What was just finished
- Licence notices for all three vendored sources: bw-circuit-ui (MPL-2.0,
  directory LICENSE + THIRD-PARTY-NOTICES), bw-board (MIT, directory LICENSE +
  THIRD-PARTY-NOTICES), sb3-creator (MPL-2.0, sb3-creator-LICENSE + THIRD-PARTY-NOTICES).
- Each sync script verified: none can delete the notice it sits beside.
- integrate.mjs confirmed to carry all three into packages/ via recursive cpSync.
- bw-debug confirmed as lite's own code, not vendored — no notice needed.

### What is NOT done
1. **SW failure-mode tests** — Playwright tests for chunk 404, fetch timeout,
   stale entry vs fresh chunks. Identified but not built. The owner found the
   white-screen bug by hand (9886889); these would catch the class.
2. **Code-tab debugger strip** — placement approved (strip under Circuit tab bar,
   shared runner via vm.runtime.bwDebugRunner). Not started. Owner may build it.
3. **Pane-slots full routing** — content swap works, full PaneColumn decomposition
   not done (high risk, not worth it per coordinator).

### What was ruled out (expensive to rediscover)
- **Node cannot reproduce the extension-block deserialization bug.** sb3.js in
  node keeps blocks with unknown extension prefixes; the browser drops them.
  Any guard for this class MUST be a headless browser test. The CI verify-gui
  job already has one (e155ca1 extension guard).
- **bw-debug is NOT vendored.** 8 files, no sync script, no upstream repo. All
  lite's own glue between sb3-creator design docs and bw-board's session API.
- ~~Devices extension unregistered (ad0384f)~~ — RE-REGISTERED. 29 of 36
  blocks have implementations that drive parts through `circuitBoard`. 7 stubs
  (showdigit, setrgb, setpixel, clearmatrix, devicestate, ircode, whenirreceived)
  remain hidden from the palette; methods exist so saved projects load. Runtime
  wiring bug fixed (constructor now receives runtime from adapter).
- **SDCC WASM byte-identity** not verified. Behind localStorage flag. Preview only.
- **Licence choice: CONFIRMED (2026-08-12).** Owner directly confirmed MPL-2.0
  for bw-parts, bw-circuit-ui, bw-cfront, bw-bundle, and sb3-creator (including
  relicensing sb3-creator from AGPL-3.0 to MPL-2.0, needed because lite vendors
  ten of its files into a BSD-3 tree and AGPL anywhere in a bundle blocks
  app-store distribution). Reasoning: MPL-2.0 requires attribution, keeps
  improvements open at file level, permits combination into a larger work under
  other terms, and §3.3 leaves the door open to GPL/AGPL later while the reverse
  would not. The commits that appeared without explanation (01860ac, e3ad9f6) were
  applied by the owner over ssh — unannounced, not unsettled.
  Repos NOT under MPL-2.0 are inherited, not chosen: ucsim-stc = GPL-2 (from
  ucsim), emu8051-stc = MIT (from Jari Komppa), brickwright-lite = BSD-3 (from
  upstream Scratch), stc lab = MIT + Apache-2.0 NOTICE for two derived examples.

## RESOLVED: camera hit-testing (a798d56)

Owner's schematic camera verified by headless Playwright hit-testing
(01-blink, "5V" label, `elementFromPoint` + parent walk to symbol `<g>`):

| Scenario | Hit at NEW pos | Miss at OLD pos |
|---|---|---|
| Pan (3×30px wheel) | HIT | MISS |
| Cursor-anchored zoom (3×ctrl+wheel) | HIT | HIT (correct — anchor keeps target in place) |
| Pan + zoom combined | HIT | MISS |

No stale hit regions. SVG viewBox-based camera updates hit areas
correctly — the browser recomputes from the viewBox, unlike CSS
transforms which can leave hit regions at old coordinates. The
cursor-anchored zoom correctly keeps the point under the cursor
nearly stationary (11px shift over 3× zoom), so the old position
still hits — this is the intended behavior, not a stale region.

The owner's camera arrived correct.

## RESOLVED: spec-update 006 (stale hobby_gearmotor refs)

bw-parts `006-stale-gearmotor-refs.md`: 5 code references to the old slug
`hobby_gearmotor` survive in bw-circuit-ui after the sidecar resync. DRC,
wire router, circuit model, and thumbnail renderer still match the old name.
The runtime references were corrected upstream and guarded across DRC arrays
and Sets, the wire router, circuit model and thumbnail renderer by five
one-at-a-time mutations. Promoted bw-circuit-ui `9cb48df02f0cc54e057598ce76e097bfc6906329`
also pins its reviewed example corpus to sb3-creator
`1d7e6c69247eecf5d28343799ce3971599073e1b`; its 32 schematic baselines were
atomically restamped after the six retired 46-port-overcurrent variants were
replaced with reviewed dense drawings. Hosted upstream CI `34245969165` is the
promotion receipt.

Lite already carried the corrected runtime vendor. The remaining old JSON/SVG
pair existed only in the ignored-but-partially-tracked package tree: no index,
source, overlay file or example referenced it, while the canonical
`gearmotor.json` and `gearmotor.svg` pair exists in both overlay and package
trees. The unreachable old pair is now deleted, with a focused absence,
non-reference and canonical-presence gate.

### Spec-update convention

Adopted per bw-parts `a6f9240 CONVENTION.md`. At session start, scan
`/mnt/volume1/code/*/spec-updates/` for items addressed to bw-bundle or
lite. Highest acted on: bw-parts 005 (sidecar drift, resolved `3ac31ad`).

## RESOLVED: sidecar-count drift (115→123)

bw-circuit-ui `4064e96` resynced from bw-parts. Vendored into lite
at `3ac31ad`: 123 JSON + 123 SVG, 4 old-name files deleted, LICENSE
intact. The sync script now deletes files that vanish upstream (with
a KEEP set protecting LICENSE). 53/53 tests pass.

## RESOLVED: schematic zero-wires defect

Headless verification (Playwright, 3 cases, deployed site at `c2c1e62`):
- Case 1 (Blink): 6 symbols, 3 nets, 12 segments — unchanged by fix
- Case 2 (Dimmer): 7 symbols, 5 nets, 22 segments — unchanged by fix
- Case 3 (LED chaser): 20 symbols, **0→20 nets**, **0→67 segments**, 0→9 junctions

Root cause: `fromJSON` did not resolve terminal aliases against each part's
real terminal list. Wire endpoints referencing legacy names never matched,
`_syncNetlist` produced 0 nets, schematic drew 0 wires. Fixed in
bw-circuit-ui `92c6450`. Cases 1 and 2 were unaffected — their circuits
already resolved. Screenshots: `/tmp/schematic-{1,2,3}-*.png`.

## PLANNED: avr8js emulator integration

**Owner: bw-bundle.** Not started — write-up only, to hand forward.

### Verified

- **avr8js** npm: MIT, wokwi/avr8js, v0.21.0 (Arduino 8-bit AVR simulator)
- **rp2040js** npm (later): MIT, wokwi/rp2040js, v1.3.3 (RP2040/Pico)
- Both need THIRD-PARTY-NOTICES.md entries when installed

### Adapter contract (coordinator, bw-board)

```
createAvr8jsAdapter({clockHz=16MHz, vcc=5, program?: Uint16Array})
  → { cpu, loadProgram(words), attachBoard(board), advanceNs(deltaNs), timeNs(), stats }
```

Boundary A identical to emu8051. Pin names: D0-D13, A0-A5
(ATMEGA328P_PINS map exported). Time-first-edge-second rule.

### What needs building

1. Intel HEX → Uint16Array parser (little-endian byte pairs, small)
2. `targetKind: 'avr8js'` path in debug-runner.js (parallel to emu8051, lines 345-410)
3. `getTargetKinds()` entry in debug-target-factory.js
4. avr-gcc compile endpoint — bw-cfront's track, not ours
5. THIRD-PARTY-NOTICES.md entries for avr8js (and rp2040js when added)

### What was ruled out

- rp2040js is later — no compile backend, no adapter contract yet
- Do not guess the adapter API — the contract must land on bw-board master first
  (as of 2026-08-10, `avr8js-adapter.js` not yet on master)
