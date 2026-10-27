# Resting-frame creep: successor handoff

Snapshot: 2026-10-27. The floor correction is complete; resting-frame creep is
open. This document is sufficient to resume the diagnostic lane, together with
[the repository protocol](../lanes/PROTOCOL.md) and
[the merged scope](../lanes/2026-10-27-robot-resting-creep-1435.md).
Refresh remote state before acting: this is a dated handoff, not a claim that
another owner or newer model cannot have landed.

## Completed work

- [Floor #1436 / PR #1445](https://github.com/CrispStrobe/brickwright-lite/pull/1445)
  merged as `7b4f2f84ac55e238bbb75663acbdc1e26f3d0358`. Its finite contact
  acceptance and retained limits are in [the floor contract](ROBOT-LAB-FLOOR-CONTACT.md).
  No floor reimplementation or repeat acquisition is needed to resume this lane.
- [Diagnostic claim #1463](https://github.com/CrispStrobe/brickwright-lite/pull/1463)
  merged as `d719999331dc6eae2ca929ae18f113a7e50b7e94` after four successful
  enabled checks and twelve declared conditional skips. This is a claim-only
  merge, not engine qualification.
- Source-only compilation identified the reported frame and two ordinary
  control models. Six local lane-protocol controls passed. No Jolt engine was
  initialized, no physics step ran, and no resting-frame implementation,
  official artifact acquisition or solver correction occurred.

## Open problem and frozen starting point

[Issue #1435](https://github.com/CrispStrobe/brickwright-lite/issues/1435)
reports an unpowered rigid frame on four coplanar flat beams translating about
10 mm and yawing about 3 degrees in 1.75 seconds, with small vertical motion
and rocking. Raising one rail by 1 LDU suppresses the reported drift. Small-part
removal changes the symptom unreliably and is not a sound bisection strategy.
The issue's original stripped model and named census of sixteen standing
controls were not supplied. Do not invent either or claim exact recovery.

The known starting point is Main `7b4f2f84ac55e238bbb75663acbdc1e26f3d0358`:

| Input | Exact identity or source observation |
| --- | --- |
| Model | `overlay/scratch-gui/static/sim-lab/models/obliquity-orrery.ldr` |
| Model SHA-256 | `3d5b09ddf62e4912c4b68eb337e4f7e2170d72eb8bc296f8e963adfb57f41e86` |
| Catalogue | `overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json` |
| Catalogue SHA-256 | `dbde6c29d4ca0b5aff97bc75676bc12c723a447d0a5daecd124b4b7b6799dba9` |
| Core SHA-256 | `d793b51541af6a1a6ecccc61548670999bc378d2fb427456cf1fc6e19107cf58` |
| Engine | `jolt-physics` `1.1.0-bw.7`; URL and integrity are declared in `scripts/integrate.mjs` |
| Compiler preparation | `prepareModel(model, catalog, {mat: 'plain'})` |
| Complete mechanism | Four dynamic bodies and four joints |
| Rigid frame | Body `b2`, 0.20642000000000005 kg, 38 parts, 51 colliders, including all four `base_rail_*` supports |
| Shipped mitigation | `base_rail_0` y is `199.0`; the other rails have y `200` |

Use part membership to identify the frame; do not rely on body ordinal alone.
The same preparation uses the helper's existing plain-mat convention.
Sleeping is disabled by default in the existing core; position/velocity solver
iterations have explicit experiment options. These are hypotheses to investigate,
not demonstrated causes or authorized product-setting changes.

## Pending work, in order

1. **Refresh ownership and inputs.** Fetch Main; read the protocol, this claim,
   issue #1435 and open claims. Record continuation in the existing diagnostic
   claim after confirming no successor is active. Reconcile changes from
   [PR #1455](https://github.com/CrispStrobe/brickwright-lite/pull/1455), which
   changes the shipped Orrery model. Preserve the exact historical input above
   as a test fixture and bind any newer input separately; do not silently relabel
   the repaired model as the reported reproduction. Keep the shipped mitigation.
2. **Implement deterministic diagnostic inputs.** Keep a complete frozen model
   and an exact test-only variant changing only the one rail coordinate from
   `199.0` to `200`. Record byte hashes and prove all other source bytes agree.
   For each variant, create a separately named isolated-frame mechanism retaining
   the compiled ground and frame bodies exactly, including mass, collider
   transforms and COM inputs. Remove all other bodies, joints, actuators,
   couplings, devices, hubs and their collision-filter relations explicitly.
   Validate the resulting graph and enumerate removed identities. This is an
   explicit mechanism extraction, not the reporter's unavailable stripped file.
3. **Implement passive recording and pure controls.** Use 200 Hz, 350 steps
   (1.75 s), including the initial pose and every completed step. There is no
   hidden settling interval. Record native position/quaternion, linear/angular
   velocity, core time, initial effective mass/COM/inertia and input/SDK/core
   identities. Copy binding-owned native values immediately; never destroy
   returned `[Value]` temporaries. Do not send motor commands, move poses,
   smooth transforms, alter material/geometry or change runtime defaults.
   Keep contact counts separate from unobserved manifold points or normals.
4. **Build the independent reader before observation.** From retained rows,
   recompute final and maximum horizontal displacement; unwrapped world-Y yaw;
   vertical range; and relative up-axis tilt. Validate finite values, normalized
   quaternions, sign invariance, exact step census and clocks. Require synthetic
   negative controls for missing/duplicate/out-of-order rows, bad quaternions,
   changed summaries and incomplete cases. Reader code must not import the
   producer or start the engine. A diagnostic pass proves data integrity only.
5. **Qualify the baseline on hosted CI.** Observe complete/isolated and
   raised/coplanar variants without changing assertions between runs. Add two
   explicitly selected ordinary shipped standing inputs, `driving-base.ldr`
   and `gearbox.ldr`; their source-only preparations had zero issues and four
   and eight dynamic bodies respectively. Freeze their identities and justify
   their unpowered saved poses before running. These two are not the unknown
   sixteen-model census. Admit metadata, acquire each official original once,
   and audit it with the standalone reader. Record absence of reproduction
   honestly. Approximate reported drift is comparison data, not an invented
   solver-pass tolerance. Do not rerun an unchanged failed or successful original.
6. **Choose a correction only after diagnosis.** Compare the baseline variants
   and separate contact manifold, solver/slop, mass/COM and sleeping hypotheses.
   A source-backed diagnosis and requirement-derived acceptance bounds precede
   any candidate. Merge a coordinated claim extension before changing core,
   settings, SDK/fork or pins: none is owned by this diagnostic claim. A proposed
   fix must preserve motion, the eight floor cases, original Sarrus judges,
   ordinary regressions and native/core rollback. Finish all enabled exact-head
   checks before normal matched-head merge and verify parents and landed tree.

## Successor progress (2026-10-27)

Steps 2–4 are implemented: frozen inputs and the one-coordinate coplanar
variant under `test/fixtures/resting-creep-1435/`, explicit isolated-frame
extraction, passive 200 Hz × 350-step recording in
`test/bw-sim-resting-creep.test.mjs`, and the standalone reader
`scripts/verify-sim-resting-creep.mjs` with synthetic negative controls.
Step 5's observations are the actual-engine test's retained `CREEP1435_RESULT`
diagnostics in the hosted unit shard; their results are recorded here only after
the official log is acquired once and audited with the reader.

## Owned paths and adjacent work

Only the new `test/bw-sim-resting-creep.test.mjs`, fixtures under
`test/fixtures/resting-creep-1435/`,
`scripts/verify-sim-resting-creep.mjs`, this document and the diagnostic claim
are owned. The only GUI dependency declaration allowed is appending that exact
new test to the existing `jolt-physics/wasm-compat` consumer list in
`scripts/lib/gui-scope-allowed.json`, preserving all other entries.
An existing actual-test entry point or workflow edit needs a scope extension.
Use isolated worktrees; source/pure controls may run locally, actual engine and
browser qualification belongs on hosted CI in the owned repositories.

[Measurement PR #1437](https://github.com/CrispStrobe/brickwright-lite/pull/1437)
and model PR #1455 have separate owners. Refresh their status; do not take over
their session, worker, model, catalogue, qualification harness or Circuit verifier
paths. Subsequent Circuit publication failures on other heads do not erase the
finite accepted floor-head result or establish a floor regression. Their owners
retain diagnosis and original intake; do not duplicate those runs or downloads.

The next deliverable is a reproducible baseline report with independently
checked raw observations, not a solver fix. Issue #1435 remains open. No general
stability, physical-accuracy, hardware, performance, deployment or release
conclusion follows from the completed floor work or this diagnostic preparation.
