# Robot Lab: fresh-agent handoff

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
  (`build` + the `unit (n/4)` shards). The `full CI requested` check fails on unlabelled
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
| #1162 | Motor power (duty cycle) blocks for SPIKE, Powered Up and others | Its agent stopped on a network error while waiting for #1163. Package **P1** below. |
| #1138 | Physics library: models, lessons, compact controls | Draft of another lane; needs `flywheel-differential.ldr` and `screw-crane.ldr` in `NEEDS_REST` (PR comment has the fix). |
| #1125, #1128 | Arcade (other lane) | Diagnosis for #1128 is in its PR comment (fetch-pinning census, TMPDIR, GUI-scope allow-list, runtime locks). |
| #1099, #1100 | SPIKE G02 drafts (other lane) | Main merged in; owner to finish. |

## Open work, scoped for a fresh agent

Each package is one PR unless it says otherwise. Read the linked docs first; follow the
rules above.

### P1 — finish the motor power blocks (#1162)
- **Goal:** proper power/duty-cycle blocks and words (en + de) wherever the real hub has
  them; the virtual hubs run them as unregulated drives (torque mode, DC motor model), so a
  motor slows under load and end stops stall it.
- **Steps:** merge `origin/main` once #1163 is in; rerun `node scripts/gen-extension-menu-args.mjs`
  so the new blocks are in the menu table and `test/extension-menu-args.test.mjs` passes;
  re-vendor CrispStrobe/extensions at or after `f2474f0` (it carries the power blocks, #60,
  and the SPIKE invalid-port guard, #61); replace the core-level 50 % power case in
  `test/bw-sim-differential-car.test.mjs` with a real program driving motor B into the rack
  stop (B stalls within 5° of ±114.6°, parked car turns < 0.2°).
- **Acceptance:** conversion round trips, a duty-cycle drive slows under load in the
  virtual hub, the car stall test runs from a program, `ci:full` green.

### P2 — two upstream extension bugs (CrispStrobe/extensions, then re-vendor)
- The SPIKE 3 Python writer reads two-motor ports such as `A+B` as `A` when given a project
  directly (Lite does not use that path today).
- micro:bit+ `setpull` reads `args.MODE`, but the block declares `PULL`: the pull setting is
  ignored.
- Also in legonxt (from #1113): bridge mode cannot work (`getBattery()` does not exist and
  the bridge returns parsed values where the code expects reply bytes); `getRawSensorValue`
  returns the normalized value, not the raw one.
- **Acceptance:** fixes and tests in the extensions repo, merged; re-vendored here with a
  brickwright test per fix. Can be folded into P1's re-vendor.

### P3 — NXT and EV3 gaps
- NXT (ROBOT-LAB-EV3-NXT.md, NXT-PROTOCOL-FACTS.md "still unverified"): ultrasonic value with
  no echo (we use 255), echoes 1–7, the interval default, whether off mode keeps the last
  reading; firmware timing after SETINPUTMODE and for I²C transactions (we complete at
  once); reply to an unknown system command (we answer 0xBE).
- NXT `.rxe` VM (NXT-RXE-VM.md): FLATTEN/UNFLATTEN unimplemented; syscalls for files,
  Bluetooth, IOMapRead/Write, colour sensor, datalog, pictures are refused by name. Open
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
- The crane (T1) has no winch yet: ropes and winches are on main now (#1123), so a drum
  and rope over the boom tip can replace the fixed hook link.
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
  change: the gate reads the layout before it has settled.

### P6 — not code
- TI service-pack PR on CrispStrobe/extensions waits for git.ti.com; its bytes are licensed
  for TI devices only and never go into a public repository.
- A machine-path file was briefly committed on a PR branch that has since been
  squash-merged and deleted; GitHub keeps PR commits, so removing it completely needs a
  GitHub Support request (owner's decision).
