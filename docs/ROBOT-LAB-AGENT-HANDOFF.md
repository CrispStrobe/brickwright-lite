# Robot Lab: fresh-agent handoff

For the current experimental checkpoint and explicit unchecked work, start with [the 24 October checkpoint](ROBOT-LAB-CHECKPOINT-2026-10-24.md).

## Read first: status and open work, 2026-10-28

This section supersedes older "in flight" notes below where they disagree. Check every PR's live state before you act on it.

**Where things stand**
- **The library grew:**
  - **#1446** promoted Toggle Lever and Thirdline.
  - **#1455** promoted six models: Cross Ratio, Foldback, Ghost Pivot, Travel Dial, Carry Ratio and Air Budget. It also added High Select's four rest-stop bushes and the qualification harness extensions.
  - **#1508**, if merged, promotes High Select and Final Squeeze; see O1.
- **Experimental intake:**
  - #1499 added RimRun, SwayShift, Tipline, TwistSpan and Evenhand, ten entries with their comparison scenes.
  - For RimRun, SwayShift, Tipline and TwistSpan, each package's own runner was re-run on main, with tracks byte-identical to the supplied recordings.
  - All ten entries complete in Chrome on the live GitHub Pages site.
  - Evidence for every entry is in `docs/data/robot-lab-experimental-checkpoint.json`.
- **See new models on GitHub Pages.** https://crispstrobe.github.io/brickwright-lite is current. https://brickwright-lite.vercel.app can lag by days; check `/brickwright-version.json` against main, and see O3.
- **`ci:full` policy changed (owner, 2026-10-27).** No `ci:full` label on PRs at all, overriding the rule further down: merge on the fast tier and fix forward from main's full run.
  - Removing the label doesn't change a run that's already queued, because the scope comes from the event payload.
  - To swap a queued full run for a fast one, close and reopen the PR.

**Open work**

**O1. Merge #1508 (High Select and Final Squeeze promotion) and watch main.**
- `--mode=full` qualification, limited to the two models, passed all 11 steps.
- When its fast tier is green (`build`, `unit (1/6)`…`unit (6/6)`; ignore `full CI requested`), merge normally with `gh pr merge 1508 --merge`.
- Then watch main's Build for the merge commit. If it goes red, read the failing job's assertion text and fix forward in a new PR.
- Known weakness, recorded in the PR: High Select's disconnection control misses the max(a,b) law by only 3.7 mm. The bridge still rests on the higher carriage, so no part removal fully breaks "follows the maximum".

**O2. Decide #1460 (motor orientation; owner decision first).**
- The compiler merges collinear hinge candidates and takes axis and body order from `group[0]` in `mech/joints.js`. A bearing hinge can therefore decide a motor's drive direction.
- Branch `fix/motor-orientation-axis-1460` (6fcdffe99) uses the motor member as the lead. It breaks 23 behavioural tests, because those programs then drive the wrong way:

  | Test file | Failures with the fix |
  |---|---|
  | `bw-sim-seven-machines` | 2 (mean-machine, stepworks) |
  | `six-technic-intakes` | 8 (atlas-six, dune-strider, oblique, vernier-drive) |
  | `phase-bridge` | 4 |
  | `physics-addons` | 2 (ripple-relay) |
  | `sarrus-lift` | 1 |
  | `wavemaker` | 4 |
  | `new-models` | 1 (gimbal-lab) |

  Main passes them all. The full table is in the #1460 comments.
- Options:
  - (a) land the fix together with updated programs and expectations for every affected model;
  - (b) add a compatibility path that keeps the old behaviour for existing models and applies the fix to new or flagged ones.
- Ask the owner which. Obliquity Orrery's promotion stays blocked until then: #1497 records it "BLOCKED by #1460".

**O3. Vercel production lag, proposal #1507 (workflow owner's review).**
- `deploy-daily.yml` publishes only main's tip, and only if that exact commit is fully validated and main doesn't move during the build. With main Builds queuing for hours, it publishes nothing: on 2026-10-28 production served `5cd027707` from 2026-10-26, 356 commits behind.
- #1507 publishes the newest validated first-parent main commit instead. It keeps the guard against an older tree overwriting a newer one, as an ancestry check against the live commit.
- Do not merge without the owner's approval. After it merges, confirm that `/brickwright-version.json` reaches a recent validated main commit within a day.

**O4. Next promotion candidates (one batch PR).**
- **Ready:** Tipline, TwistSpan and SwayShift each passed their package's full native qualification on main, so they are the next candidates. For each:
  - write a judge in `scripts/lib/` that rejects a frozen output and a 1 cm world shift;
  - add a contract in `docs/data/robot-lab-qualification.json`, a source fixture with `provenance.json`, and a disconnection branch in `test/bw-sim-qualification.test.mjs` that asserts the law is lost;
  - register the model everywhere `MODELS` is enumerated;
  - run `node scripts/qualify-robot-lab-models.mjs --mode=full`.
- **Worked examples:** commits `f94ebec21` (#1508), `d58d8b92b` and `6b8501171`.
- **Model notes:**
  - SwayShift: the comparison is a second program on the same model (entry id `swayshift-in-phase`).
  - TwistSpan: the control is `twistspan-inner`.
  - Tipline: the control is `tipline-swapped`.
- **Evenhand** needs a torque judge. Its law is visible only in motor holding torque (`session.core.jointDynamics(id).motorTorqueNm`), not in poses, because the engine's motors hold any load:
  - balanced, all nine poses: shoulder 0.33–0.36 mN·m, elbow < 0.01 mN·m;
  - control: elbow 0.61·cos(A+B) mN·m.
- **RimRun** is not ready: its hub stands free beside the ramp, so `prepareModel(...).issues` reports `loose-part` for the frame and promotion requires `issues: []`. First mount the hub to the frame with real pins or plates. Re-run its package's construction and rolling checks, which still pass on main. Its post-finish catch and watchdog-hold gates fail by its author's own declaration and need a design change too.

**O5. Close or chase #1477 (ADC point-mode journey flake, Circuit UX gate).**
- #1486, merged 2026-10-27, fixed the scope-capture re-render. Check `browser (light)` on main's last five Build runs.
- If none failed at `ADC_POINT_MODE_PUBLICATION`, close #1477 with the run links; otherwise add the failing run's assertion text to the issue.

**O6. #1435 (coplanar flat-beam frame creeps on the floor).** It's another lane's (diagnostics PR #1498). Don't duplicate it; re-qualify affected models only after its engine fix lands.


Updated 2026-10-21. This is the public entry point for continuing Robot Lab work (the
`lib/bw-sim/` simulator, the virtual hubs, the Robot Lab tab) without chat history.
It records what landed, how work lands here, what is in flight and — scoped so a new
agent can pick it up cold — every open item. Verify the state of a PR or branch before
acting on it: this page is a snapshot, not a lock.

Related: [SIM-LAB.md](SIM-LAB.md) (what the Lab is and how it works),
[ROBOT-LAB-ARCHITECTURE.md](ROBOT-LAB-ARCHITECTURE.md) (mechanisms, couplings, the
T-series machines), [ROBOT-LAB-VALIDATION.md](ROBOT-LAB-VALIDATION.md) (physics validation
rows), [ROBOT-LAB-HUB-COVERAGE.md](ROBOT-LAB-HUB-COVERAGE.md) (which hub works over which
transport), [ROBOT-LAB-EV3-NXT.md](ROBOT-LAB-EV3-NXT.md), [NXT-PROTOCOL-FACTS.md](NXT-PROTOCOL-FACTS.md),
[NXT-RXE-VM.md](NXT-RXE-VM.md), [EV3-RBF-VM.md](EV3-RBF-VM.md),
[LWP3-VIRTUAL-HUB-NOTES.md](LWP3-VIRTUAL-HUB-NOTES.md), [ROBOT-LAB-LDD-FRAMES.md](ROBOT-LAB-LDD-FRAMES.md).

## What landed 2026-10-19 … 21

- **Hubs:** NXT protocol corrected against LEGO's BDK appendices and the 1.29 firmware
  (#1111); clean-room NXT `.rxe` VM with file download and STARTPROGRAM (#1115); NXT words
  for legonxt (#1129); NXT motor sync, buttons, ultrasonic listening (#1130); EV3 `.rbf` VM,
  `Scratch.fetch` in the CrispStrobe adapter (legonxt/ev3comprehensive compile blocks),
  Powered Up stop actions and hub names (#1127); legonxt reply offsets re-vendored (#1113);
  virtual transports for EV3, ev3dev, LWP3 bridge, NXT and SPIKE bridge (#1161).
- **Physics (Jolt fork releases bw.3 → bw.5):** universal joint, rolling resistance,
  restitution (#1126); CCD-bounce fix in the fork, restitution per material pair, static
  rolling resistance (parked wheels hold), tread rolling resistance (#1134);
  chassis-relative rack and pinion `RackMeshConstraint` (#1149); end stops through gears,
  chains, bands, racks and shift forks that stall speed **and** power drives, pneumatics,
  big-model speed-ups, the native part-pair collision filter (bw.5), real-model import
  (#1137).
- **Machines and examples:** chains, treads, rubber bands (#1116, #1123); crane (#1135);
  differential car (#1142) with a real steering rack (#1155) and its stall test (#1160).
- **Later on 2026-10-21:** extension menu arguments stored in their declared shape, old projects repaired on load (#1163, generated `extension-menu-table.js` via `scripts/gen-extension-menu-args.mjs`); old motors and the LeoCAD/LDD importers (#1151, squash-merged); real-model stability and four example fixes (#1169).
- **CI:** browser shards run only for the paths a PR touches (#1121); two flaky light gates
  fixed (#1159); AshFactory test seeded (#1146).

## How work lands here (rules that cost time when ignored)

- **Batch.** One PR per batch of related work; push checkpoints to the branch without a PR.
  The CI queue runs only a few jobs at once and a full Build is about 15 jobs.
- **`ci:full` only when the browser tier can catch something:** startup bundle / P17
  (anything that might load at first paint), Robot Lab UI / editor / tablet, CI workflows
  or gate scripts, dependency bumps (Jolt). Everything else merges on the fast tier
  (`build` + the `unit (n/6)` shards). The `full CI requested` check fails on unlabelled
  code PRs by design — ignore it. `main` runs the full set on every merge: watch it and fix
  forward at once if it goes red.
- **A rerun keeps its original merge SHA.** After `main` moves, merge `origin/main` into
  the branch (never rebase or force-push a shared branch); a rerun will not pick the fix up.
- **A conflicting PR gets no CI run at all.** Check `mergeable` before waiting on CI.
  Lane claims are one file each under `lanes/` (see `lanes/PROTOCOL.md`) precisely so
  PRs stop conflicting on `LANES.md`.
- **New models go into four lists:** `MODELS` in `lib/bw-sim/sim-session.js`, the model
  list in `test/bw-sim-models.test.mjs`, and the model names in
  `lib/robotLabDialect.js` and the robotlab extension (`overlay/scratch-vm/.../robotlab/index.js`);
  models with derived parts also go into `NEEDS_REST` in `test/bw-sim-lazy-catalog.test.mjs`.
- **New physics tests go into `scripts/lib/gui-scope-allowed.json`** (a CI-only check).
- **Run unit tests with the repo loader:** `node --test --import ./scripts/lib/register-gui-scope.mjs <files>`.
  Plain `node --test` cannot find `jolt-physics`: physics tests fail in milliseconds and the
  worker test hangs. After switching branches run `node scripts/worktree-deps.mjs link`
  (integrates, links the content-keyed deps store, applies overlays, verifies). MakeCode /
  Arcade tests also need `npm run sync:makecode`; without it they fail with `NO_RUNTIME` —
  that is a local setup error, not a regression (it misled a bisect once).
- **P17 first-load budget** (`scripts/lib/webpack-ownership.mjs`): about 0.5 KB headroom.
  New UI goes behind `React.lazy`, `lazyBuiltinExtensions` or the `bw-sim-lab` chunk, with a
  LAZY entry in `scripts/verify-boot-payload.mjs` and its fixture line.
- **Vendored code moves upstream first.** Extensions come from CrispStrobe/extensions via
  `scripts/spike/bundled-upstream.mjs` (`UPSTREAM_COMMIT`, then
  `node scripts/spike/vendor-bundles.mjs`); `sb3-creator.js` / `sb3-creator-spike3.js` must
  stay byte-identical to the CrispStrobe/sb3-creator pin — Lite-side compiler fixes go in
  `sb3-creator-register-art.js`. Jolt changes go into the fork (documented in its
  `BRICKWRIGHT.md`), released by its own workflow, then pinned here; nothing goes upstream to
  Jolt.
- **Licences and data:** third-party sources (LEGO firmware, NBC, nxt-python, lms2012, …)
  are fact sources only — cite, never copy. Never commit LEGO PDFs, LDD data, `ldraw.xml`
  or per-part numbers derived from it (frames come from geometry rules or connections; see
  ROBOT-LAB-LDD-FRAMES.md). A PR whose history once held such data, or a machine path, is
  **squash-merged** and its branch deleted.
- **Shared machine:** stop processes by your own PID or your own worktree path, never by a
  broad pattern (`pkill -f webpack` matches other sessions' builds). Keep build output and
  `TMPDIR` on the large data volume; delete them when done.

## In flight at handoff

| PR | What | State and next step |
|---|---|---|
| #1138 | Physics library: models, lessons, compact controls | Draft of another lane; needs `flywheel-differential.ldr` and `screw-crane.ldr` in `NEEDS_REST` (PR comment has the fix). |
| #1125, #1128 | Arcade (other lane) | Diagnosis for #1128 is in its PR comment (fetch-pinning census, TMPDIR, GUI-scope allow-list, runtime locks). |
| #1099, #1100 | SPIKE G02 drafts (other lane) | Main merged in; owner to finish. |

## Open work, scoped for a fresh agent

Each package is one PR unless it says otherwise. Read the linked docs first; follow the
rules above.

### P1 and P2 — done
- **P1:** the motor power blocks landed with #1162 (after #1163).
- **P2:** CrispStrobe/extensions #68 fixed micro:bit+ `set pin pull` (it read `MODE`, the block
  declares `PULL`) and NXT `raw value of sensor` (it read the normalized word at 10–11; the raw
  ADC word is at 8–9, which touch-pressed `raw < 500` assumes). Both are vendored here with
  `test/extension-p2-pin-fixes.test.mjs`. The legonxt bridge items were fixed earlier (#58, #59).
  The SPIKE 3 Python writer's `A+B` report was **not reproduced**: transpiling a stored project
  whose port menu holds `A+B` emits one command per port, and the superseded BLE extension has
  only single-port menus. Reopen with a concrete project if it recurs.

### P3 — NXT and EV3 gaps
- NXT (ROBOT-LAB-EV3-NXT.md, NXT-PROTOCOL-FACTS.md "still unverified"): ultrasonic value with
  no echo (we use 255), echoes 1–7, the interval default, whether off mode keeps the last
  reading; firmware timing after SETINPUTMODE and for I²C transactions (we complete at
  once). These remain documented as unverified there, with the reason.
- Settled: the reply to an unknown system command. Firmware 1.29 returns status 0x02 with
  the opcode and stale bytes (NXT-PROTOCOL-FACTS.md §Disagreements, #1489); the Virtual NXT
  deliberately keeps 0xBE.
- NXT `.rxe` VM (NXT-RXE-VM.md): FLATTEN/UNFLATTEN and standard virtual-file calls
  (0–8, 47) are implemented; Bluetooth, IOMapRead/Write, colour sensor, datalog and
  pictures remain refused by name. File calls share bounded virtual flash, with
  explicit binary extents and program-owned cleanup; physical flash layout and an
  active-image loader handle are not modeled. Open
  questions to settle on real hardware or from the firmware: NXC `Float` leaves BRAKE set
  (does the brick coast?); 2-D array element assignment is a no-op in our reading of 1.29.
- EV3 `.rbf` VM (EV3-RBF-VM.md): COM_*, MAILBOX_*, other FILE subcommands, PROBE, DO,
  breakpoints, SYSTEM, PORT_CNV, NOTE_TO_FREQ, MEMORY_READ/WRITE, INPUT_SAMPLE, FILENAME, TST
  are refused by name; the instruction rate (200/ms) is an estimate; lmsasm gives
  ARRAY16/32/F one byte per element (assembler bug — fixtures use ARRAY8/DATAS).
- Powered Up: the Technic Hub (0x80) and SPIKE Essential (0x83) system-type IDs come from
  community sources (LEGO's LWP3 document does not list them).
- **Acceptance:** each item either implemented with a test against a cited fact, or
  documented as unverified with the reason. Fixtures come from the owner's hosted compilers
  (NBC for NXC → `.rxe`, lmsasm for `.rbf`, NQC for `.rcx`) compiled once and committed;
  tests never call the network.

### P4 — physics follow-ups
- Measure, or source better, restitution and rolling resistance for LEGO parts on the mat
  (ABS e 0.4 and tyre/tread c_rr are cited estimates; ROBOT-LAB-VALIDATION.md "Materials").
- A brick dropped from 50 cm or 1 m bounces straight once but Jolt's solver gives a flat
  multi-contact bounce 0.1–0.3 rad/s of spin, so it lands tilted after the second bounce
  (validation row 7c was reformulated to "first bounce straight, no tunnelling").
- Solver mass/inertia floors make a sprocket-driven tracked frame coast about 4.4× longer
  than its real parts would.
- The differential car's rack moves both tie rods together, so it turns 4.9 % wider than
  the bicycle model (the check now accepts the band between the front wheels' own turn
  centres). Deeper steering arms recover Ackermann but rub motor A — a geometry rework.
- The crane winch continuation replaces the fixed hook link with a retained drum on C,
  a moving boom-tip guide and balanced rope-hung payload. Require its affected hosted
  hoist/hold/payout/slack and real project save/reopen qualification before landing;
  virtual tension checks do not establish physical accuracy.
- The Jolt fork's next step is the multithreaded build (the native part-pair filter in bw.5
  removed the JS callback that blocked it).

### P5 — CI flakes still seen
- `verify-arcade-legacy-layout.mjs` `runEdited` 30 s timeout; `verify-arcade-physics-engine-browser.mjs:99`
  (`oldX` 22 vs 20 — a frame race); `verify:debug-inspection` ("1 debugger browser check
  failed"); the browser step audit failing when GitHub reports steps late. Each should be
  fixed at the cause (wait on the state the assertion needs), not retried; record them in
  docs/ARCADE-888-OPEN-FAILURES.md if they belong to that lane.
- Load-sensitive Arcade unit tests in `unit (3/4)`: value-arithmetic (`makecode-arcade-value-arithmetic.test.mjs`
  :54 and :144), `makecode-export-arcade.test.mjs` :275 and :360, and randint authoring failed
  together on main once (after #1169), with the PXT program never starting within the 20 s guard;
  a rerun of the same SHA passed. Look for shared-runtime contention in that shard (several PXT
  runtimes booting at once) rather than raising timeouts again.
- The controller-pane layout gate (browser light) failed once in landscape and once locally in
  portrait ("Undo; text; Blocks; …" covered, full-screen entry not hittable) without a related
  change: the gate read the layout before it had settled. It now waits until every
  control's rectangle is unchanged for ten consecutive frames (bounded at 15 s; not settling
  fails the gate), before the normal and the full-screen reads.

### P6 — not code
- TI service-pack PR on CrispStrobe/extensions waits for git.ti.com; its bytes are licensed
  for TI devices only and never go into a public repository.
- A machine-path file was briefly committed on a PR branch that has since been
  squash-merged and deleted; GitHub keeps PR commits, so removing it completely needs a
  GitHub Support request (owner's decision).
