# bw-bundle — blocked items (campaign: circuit parity)

## ~~OPEN~~ — FIXED (2026-09-29): the SPIKE arena gate was decided by two independently scheduled clocks (2026-09-28)

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

---

**UPDATE, 2026-09-28 21:2x — no longer "once", and the experiment ran itself.**
The note above rested on a single observation and declined to guess. Both of
those are now out of date.

**It is not branch-specific, and it fails on `main`.** Four distinct refs hit it
in one evening: `docs/cp07-timer64-closeout`, `docs/cp06-ev3-closeout`,
`lane/census-window`, and **`main`**. So every PR inherits a red `browser
(light)` from it.

**The coin-flip is measured.** `browser (light)` outcomes, interleaved, inside
half an hour, on content that did not change between them:

| started | verdict |
|---|---|
| 20:45 | success |
| 20:56 | failure |
| 21:05 | failure |
| 21:07 | success |
| 21:10 | failure |
| 21:12 | success |
| 21:21 | failure |
| (and a success at 21:07/21:12 band) | |

Four and four. The saturated runner pool documented in the entry below was an
accidental, fleet-scale version of exactly the CPU-throttling experiment this
note asked for, and **the verdict flipped**. The coupling is confirmed: the
gate's answer is a function of runner load, not of the code under test.

**The direction is now indicated too.** Every failure is `time is up`, never a
wrong position or a crash. Per the mechanism above that is the rAF-survives /
VM-starves branch: the arena's `timeMs` keeps accumulating frame deltas while
the VM falls behind, so the budget expires under a robot that has not travelled.
The MAX_FRAME_MS = 100 clamp is what makes the other direction unreachable — it
can only ever make sim time run SLOW, which would make a mission easier, not
fail it. So the clamp protects against the harmless direction and not the harmful
one.

**What this cost everyone while it was open:** a green on this gate carried about
one bit of information and half of it was luck. Re-running until it passed would
have laundered that, so this note was written instead.

**FIXED 2026-09-29 — one clock, and it is the VM's.**
`overlay/scratch-gui/src/lib/spike-arena/arena-clock.js` (`VmStepClock`) counts
the VM's executed steps and gives the pane `runtime.currentStepTime` per step in
place of a wall-clock frame delta. Simulated time is now a function of what the
VM actually ran: N steps always buy N x stepTime of mission time, so starving the
VM slows the mission with it, and the verdict is a fact about the program rather
than about runner load.

The interval is NOMINAL, not the measured duration of a step. Using the real
elapsed time would put the wall clock straight back in, and the flake with it.

Details that matter to anyone touching it:

  - the hook WRAPS `runtime._step` rather than replacing it, so any other wrapper
    in the chain still runs, and `uninstall()` REFUSES to restore over a later
    wrapper somebody else installed — it stops counting instead of silently
    deleting their behaviour;
  - installing twice is a no-op, because a pane re-entering `start()` must not
    make time run at double speed;
  - `clear()` on resume, so a pause cannot later be spent as mission time;
  - with NO vm there is no program to be fair to, and the clamped wall clock
    stays as the fallback. `MAX_FRAME_MS` survives for exactly that path.

**The hook's one dependency, and the guard for it.** scratch-vm drives the loop as
`setInterval(() => { this._step(); }, interval)` — a property lookup at call
time, which is the only reason reassigning `runtime._step` is seen at all
(verified in both the tracked mirror and the copy that actually executes). If
upstream ever changes that to `setInterval(this._step.bind(this))` the hook goes
silently inert, and silence is the DANGEROUS direction here: no steps counted
means mission time frozen, missions that never time out, and a gate that cannot
fail — strictly worse than the flake. `isInert()` catches exactly that (installed,
asked 30+ times, never counted a step) and the pane falls back to the wall clock
rather than freezing.

Thirteen tests in `test/spike-arena-clock.test.mjs`, in the fast suite. The one
that states the defect is a measurement rather than prose: over 301 frames of a
50 ms loop with a stalled VM, the old rule spends the entire 15 s budget and the
step clock spends ZERO. Falsified three ways — accruing in `take()` instead of per
step fails 4 of the 13, dropping the double-install guard fails 1, and disabling
`isInert()` fails 2.

**The instrument for re-checking this:**
`scripts/measure-arena-clock-stability.mjs` runs the same mission the gate runs,
once per CDP CPU-throttling rate (default 1x 2x 4x 6x 8x), and exits 1 if the
verdicts disagree. That is exactly the experiment the original note asked for,
pointed the other way: before the fix the verdict was expected to flip, now it
must not. It also prints the arena's own `timeMs` per rate, which is the number
that used to track the wall clock. Deliberately NOT a CI gate — it launches the
mission once per rate and runs for minutes; it is what you reach for after
touching either clock, or when somebody doubts the coupling.

**MEASURED 2026-09-29, with a control.** Both builds were downloaded as CI
`github-pages` artifacts and served locally; each bundle was grepped first to
confirm which one it was (`VmStepClock` present in the treatment, absent in the
control), because measuring a stale build is the classic way to get a clean
meaningless number.

| build | 1x | 4x | 8x | spread |
|---|---|---|---|---|
| `c2de17777` (pre-fix, control) | 5195 ms | 5245 ms | 5395 ms | **200 ms**, monotonic with throttling |
| `0d71e9062` (fixed) | 5165 ms | 5165 ms | 5165 ms | **0 ms** |

Simulated time in the old build tracks CPU speed; in the new build it is
bit-identical under an 8x slowdown. At 1x vs 8x alone the control drifts 315 ms.

**What this does NOT show: the verdict flipping.** The control returned `pass` at
all three rates, because this mission finishes in ~5.2 s of a 15 s budget and had
the headroom to absorb 200 ms. So the failure itself was not reproduced — what was
reproduced and quantified is the DRIFT that causes it, and its elimination. CI is
a far harsher environment than an 8x throttle on an idle box (the flake was
observed with ~78 jobs queued), and a mission with less slack is where drift
becomes a flip.

That distinction also fixed a defect in the instrument: its first version treated
agreeing verdicts as proof of one clock, and would have called the drifting
control healthy. Drift is now a first-class finding — the control exits 1, the
fixed build exits 0.

**Still not claimed:** the gate has not been watched green across many loaded CI
runs. The coin flip was 4/4 over eight runs, so a handful of passes proves little
on its own. It also leaves the arena lane's own work
(`feat/spike-arena-pins-2`) untouched apart from this coupling.


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

**A SECOND mechanism, found on the next sweep: merging a PR and deleting its
branch does not cancel that branch's queued runs.** After the main sweep, 12 of
the 68 still-queued runs were dead, and only one of those was main's:

| branch | state | queued runs |
|---|---|---|
| `fix/spike-prime-ci-isolation` | PR #493 MERGED, branch DELETED | 3 |
| `feat/spike-prime-cpu-operations` | PR #487 MERGED, branch DELETED | 3 |
| `feat/spike-prime-e2e` | #488 merged, #492 closed; sha not the tip | 3 |
| `lane/blocked-gallery` | superseded by my own push | 2 |

`cancel-in-progress` only collapses runs within one concurrency group while the
ref still exists. It has nothing to say about a ref that is gone: those six runs
were queued for branches GitHub itself had deleted, and they would have been
served — cloning a branch that no longer exists — ahead of live work. There is
no setting for this; it needs a sweep.

**The classification that makes the sweep safe** is remote state, not local. A
pruned local clone reports a branch as missing when it is merely unfetched, so
resolve each one against the remote and against its PR before cancelling:

```bash
git ls-remote --heads origin "$br"     # empty => really deleted
gh pr list --state all --json number,state,headRefName
```

Cancel only: sha is an ancestor of current main; or the branch is deleted AND
its PR is merged/closed; or the sha is not the branch tip and no open PR wants
it. 56 of the 68 were none of those and were left alone — they are other lanes'
live work, and a queue being deep is not a licence to empty it.

**THE CASCADE, and the exception that nearly made me the cause of it.** The
queue does not only delay verdicts — it manufactures red ones in OTHER repos.
`#455 browser (light)` failed, on a branch full of phone-layout changes, at a
step called **"Require green upstream evidence for the pinned 8086 engine"**.
Reproduced locally:

```
bw-board CI evidence FAILED: no successful CrispStrobe/bw-board CI workflow
exists for pinned SHA d9a967cad... (matching runs: 36448206942:queued/-)
```

The run is not missing and not failing. It is QUEUED — starved by the same
account-wide Actions pool. bw-board was at **39 queued, 0 running**. So:

    account pool saturated
      -> bw-board CI for the pinned sha never runs
        -> lite's verify:bwboard-ci finds no green evidence
          -> EVERY lite PR is red, at a step none of them touched

Nothing in lite can fix that, and the failing step names an engine, which sends
the reader into the 8086 code. The tell is that the gate reports a run id with a
status: `queued/-` is not `failure`.

**The exception: DO NOT CANCEL A SHA THAT SOMETHING DOWNSTREAM PINS.** The
sweep rule recorded above — "cancel a queued run whose sha is an ancestor of the
current tip" — would have cancelled run `36448206942`, because `d9a967cad` IS an
ancestor of bw-board's master. It is also the sha lite pins, and its green run
is the evidence a downstream gate requires. Cancelling it would have converted a
slow gate into a permanently red one, and the sweep would have looked correct
while doing it.

So the rule gains a clause, checked BEFORE ancestry:

```bash
# in every downstream repo that pins this one
grep -h '"<repo>"' */vendor-pins.json | grep -oE '[0-9a-f]{40}'
# never cancel a queued run whose head_sha is in that set
```

A superseded sha is worthless *as a branch verdict* and can still be load-bearing
*as pinned evidence*. Those are different questions and only the second one has
a downstream consumer.

Swept on that basis: 32 of bw-board's 39 (22 for five branches whose PRs were
all MERGED and whose refs were deleted, 10 superseded), 1 protected, 6 left as
live work. 39 -> 12 queued, and the protected run started moving.

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
