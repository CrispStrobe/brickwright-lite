# Resonance Lab: current application qualification

This directory qualifies the **current application checkout** with the original
Resonance Lab model and three programs. It does not replace, regenerate or relabel
the standalone release's qualification on `df32b7ff33595406ce7356d249ec61baec1fecf6`.
The original complete-model input freeze is
`c0bc4310a21feac62ab7788d3fe094ea35c0ba47339461b34fb2e527a599f2a7`.

## What stays exact

`original-inputs.json` binds the two delivered CAD files, all three programs,
placement ledger, independent passive inertia, and original analysis and
diagnostic modules. Those copies retain their BSD-3-Clause notices and original
bytes. In particular, `analysis/acceptance.mjs`, `analysis/response.mjs`, and
`analysis/dynamics.mjs` retain the predeclared physical limits, response windows,
negative control and independent predictions. The historical `SCOPES` strings
inside the unchanged acceptance copy describe the standalone release; they are
not the status of this application integration. This test imports only its
limits, cold-start settings and acceptance function.

The original read-only native capture and structural diagnostic validator are
also byte-identical. `runtime/observe.mjs`, `runtime/check-program.mjs`, and
`runtime/program-vm.mjs` change only source resolution to this checkout; the
observer additionally obtains placed anchor coordinates from `runModel`, because
the current app's Plain mat translates the saved model to its start pose.
The program runner also rejects an external `BW_INTEGRATED_ROOT` before loading
the real VM. The VM, timer and recorded source identity therefore use the same
checked dependency tree.
`inertia.mjs` extracts the original per-collider rigid-body calculation without
the development fixture or its optional clamp.

`runtime/rig.mjs` imports the current app's own constructor, preparation path,
hub, API and Jolt loader. Ordinary preparation uses `SimSession.fromText`.
Strict preparation uses `prepareModel({autoPorts:false})` and passes that exact
result to the native constructor, because `fromText` does not forward the option.
Both use the Plain mat as the built-in menu does. No mechanism, pose, mass,
inertia, friction, collision filter, controller setting or engine implementation
is written by the harness. The output has no motor command or hidden driver.

## What it proves

1. Both fresh unpowered cold starts retain the original 16 checks over one
   native second, with no external motor or hold command.
2. All three exact finite programs run from fresh models in ordinary and strict
   preparation. The real compiler creates SB3, the real Scratch VM schedules
   its blocks and joined receiver, and the actual Robot Lab extension and SPIKE
   controller drive the single motor.
3. Every actual 5 ms native step is observed. The observer measures the passive
   arm, bearing closure, shaft alignment, axial displacement, base motion and
   both native band paths from real rigid-body poses. It captures actual
   VM/native clock boundaries rather than inferring them from motion.
4. All original finite-burst gain, frequency, ringdown, envelope, execution,
   independent-inertia, and cross-mode gates remain in force. Frozen observed
   output must still be rejected in every experiment.

The gain and phase concern the fixed last two cycles of a four-cycle burst;
they are not a steady-state frequency response. The continuous ODE and separate
5 ms backward-Euler sensitivity comparison stay unfitted. Hardware calibration
and actual browser behavior require their separate evidence.

## Running and preserving evidence

Run from the repository root after the pinned dependency setup:

```bash
BW_RESONANCE_EVIDENCE_DIR=artifacts/resonance-native-qualification \
  node --test --import ./scripts/lib/register-gui-scope.mjs \
  test/bw-sim-resonance-program.test.mjs
```

The chosen output directory must be absent or empty. This prevents replacing
an earlier success or failure. Before any physics, the test records current
native source hashes, metadata hash, compiler pin and module hashes, installed
VM source identity, and the selected Jolt scalar/SIMD distribution and version.
The dependency root is checked against this checkout's `packages/scratch-gui`,
and its resolved path is recorded. An override selecting another tree is refused.
The additional owned-source map follows the JavaScript relative-import closure
of the actual compiler registration door, real hub state and backend, and test
loader/helpers. This includes `extension-menu-args.js` and its table. It follows
literal imports, reexports and requires using the installed Babel parser; that
parser's version and entry files are also hash-bound. Conditional literal imports
are included conservatively. Computed helper entrypoints are named explicitly,
and unresolved computed calls and bare imports are reported without claiming an
exhaustive dependency archive. Stock VM support imports are covered by the
separate hash of the entire installed VM source tree.
It preserves the exact input and application source files in `frozen-inputs`.
Each cold start and powered experiment writes its own complete report with
raw samples and actual body poses. `qualification.json` binds these by hash.
The first failing experiment stops the run, and its partial observations remain
in the output. Source and qualification inputs must remain unchanged throughout.

Omit `BW_RESONANCE_EVIDENCE_DIR` for a normal unit-suite run that reports results
through TAP. The full user-facing integration qualification should always retain
an explicit evidence directory. Run the native experiments sequentially: the
repository's real-VM test clock is process-global.

The pure `test/bw-sim-resonance-provenance.test.mjs` checks wrong-root refusal in
both source recording and the actual program runner before any native step,
transitive import coverage, and missing-import refusal. Run it with the same
registered loader; it does not construct or run native physics. New provenance
fields apply only to future freezes. Earlier evidence directories retain their
original reports, inputs and identity format.

All original code and prose here: Copyright (c) 2026 Christian Ströbele
(CrispStrobe), BSD-3-Clause. Third-party engine and standard-part data retain
their own upstream licenses; this directory embeds no external mesh library.
