# 8086 construction policy and GUI integration

This P3 candidate starts at Lite `411828a304dd84759cd4c1fb82444e72944ffbdc`.
It is independent of the paused copy-based engine adoption. It requires the
coordinated npm dependency migration to supply `bw-board/execution-policy`;
there is no local package substitute, vendor edit or pin movement in this lane.

The static app catalog admits only the existing JavaScript DOS-services and
functional-hardware constructors, separately for 8086 and 80186. It grants no
new observer capability, wired runner or native execution support. The engine
policy performs structural admission, not a fresh certification of these cores.

Settings → 8086 execution diagnostics saves Auto / Functional / Wired locally
(tab fallback if storage fails). Auto and Functional both preserve the context:
DOS media keeps DOS services; hardware remains hardware. Wired asks for wired
semantics and is explicitly refused before the target factory runs. The RAM
shortcut diagnostic remains independent. Changing either preference leaves
existing targets unchanged; rebuild or reattach to apply.
This first slice is explicitly browser-local, not project-saved semantic
metadata. Exporting or sharing a project does not transfer this preference.
The UI labels this scope and continues to derive semantics from media/context.

DOS bench construction and the hardware `createDebugTarget` boundary perform
admission. Active requested/actual/reason metadata is frozen and published only
after construction succeeds. Errors publish refusal, not a fictitious active
backend. Runner destruction/failure releases only its owned result; cancellation
or a superseding construction cannot publish stale active status. The isolated
JS/decoded/Wasm benchmark remains unrelated to project execution.

## Acceptance and limits

Tests cover preference persistence/storage failures, context/family separation,
refusal before factory invocation, no live switching, construction failure,
cancellation, supersession and ownership-safe release. Integration source tests
hold the actual construction/disposal call sites and tracked mirrors.
Full application/build/browser gates require the package migration; this branch
must not be described as deployable until those gates run against the integrated
dependency and UI. This first slice does not change observer/topology lifecycle,
enable whole-backend hot swap, or assert 4.77 MHz wired performance.

Focused verification: Node 22.12.0, 20 tests passed with zero skips in policy,
real DOS construction, existing sandbox and RAM-preference callsite suites.
The explicitly mapped P2 source is engine `617dc44217bdf2d7fc48f63c079102e65207998b`,
`src/execution-policy.js` SHA-256
`626a82b2f19971a09c72afab1e4c1575e4339253c5b57fa33ac3217d4d971619`.
Reproduce before package integration with an explicit absolute source mapping:

```sh
BW_EXECUTION_POLICY_SOURCE=/absolute/pinned-engine/src/execution-policy.js \
node --loader ./test/helpers/execution-policy-source-loader.mjs \
  --test --test-concurrency=1 test/i8086-execution-policy.test.mjs \
  test/i8086-execution-policy-construction.test.mjs \
  test/i8086-memory-preference-at-the-call-site.test.mjs test/i8086-lab.test.mjs
```

After migration run against the actual installed package without the loader or
environment override. The loader is test-only, maps just this exact module, and
does not create a fake package or authorize a production fallback.

Review follow-up covers package loaders and factories rejecting `null` or
`undefined`: both remain named `construction-failed` refusals. Abort before
delivery invokes the returned target's optional `destroy` hook (the inner
`result.target` for composite DOS results). Current DOS/debug target/machine
objects have no such hook or externally scheduled execution of their own, so
their abandoned state is ordinary collectible JavaScript. After successful
delivery, the runner owns session/target teardown; the signal listener only
clears active status. Composite wrappers are not assumed to own a destructor.

Mirror provenance: at base `411828a`, the authoritative overlay diagnostics JSX
had 96 lines, but its `packages/` counterpart was untracked/ignored, not a stale
tracked version. This candidate deliberately adds the exact authoritative
overlay copy to tracked `packages/`, hence the initial 124-line package addition
versus a 30-line overlay diff (29 insertions, one deletion). Subsequent label changes remain byte-identical;
the integration regression checks that identity. No unrelated package files
were mirrored or imported from another worker's tree.

## Executable browser gate (not yet run for this candidate)

`scripts/verify-i8086-browser.mjs` now extends the existing production journey:
after real local assembly and DOS execution it opens the actual diagnostics,
checks Auto/DOS-services/JavaScript status, selects Wired, checks persisted
storage and unchanged active label/target/registers/RAM, then reassembles through
the actual UI and requires a named refusal with no active-backend claim. A
reload proves persistence rather than just the tab override; selecting Auto
and assembling again must restore a real DOS-services selection. Initial
storage clearing is now once per browser session so reload does not erase the
very preference under test. No synthetic constructor is called by this proof.

After the package migration and a fresh build, execute the existing command:

```sh
PROOF_URL=http://localhost:8617/ node scripts/verify-i8086-browser.mjs
```

The existing workflow already runs this gate and preserves its artifact folder.
For this candidate only syntax and source-contract tests have run, not Chromium;
they are not browser acceptance. The migration worktree was still dirty at
`411828a` when checked, so no heavy build/browser run was started. Hardware-ROM
browser construction and 80186 UI selection still need an additional journey;
the bounded controller/real DOS tests are not a claim that those UI paths passed.

## Migration handoff diagnostic — 2026-09-12 09:43 UTC

Read-only remote pins: Lite `main` remained
`411828a304dd84759cd4c1fb82444e72944ffbdc`; bw-circuit-ui `master` remained
`a5fcd9394f4184537f8eeaad2c3d211a0e00abe7`.
The npm migration tree was still uncommitted at that Lite base, with engine
`d7436dc782dd1c499f0fb29ae5cfaa8ab78ec2d6` and circuit UI
`657e0217fa14fe345ad2781ae87d7f1e9b1e42fe` in its package specs. That engine
package does not yet contain P2 execution-policy. The migration remains owned
by its original coordinator; a session-limit message is not an ownership transfer.

[Circuit UI PR 20](https://github.com/CrispStrobe/bw-circuit-ui/pull/20) remains
open. [Run 34685501168](https://github.com/CrispStrobe/bw-circuit-ui/actions/runs/34685501168)
at exact circuit commit `657e0217fa14fe345ad2781ae87d7f1e9b1e42fe` passed its
unit, SPICE and KiCad jobs but failed the browser interaction job: 33 of 34
scenarios passed. The sole failure was `sweep-canvas-live`, reporting a resistor
movement of 0 px while the sweep was running. All 60 progress labels appeared
and there were zero page errors. The run uploaded no artifacts.

The precise failing predicate is in `scripts/verify-interaction.mjs:1265–1289`:
it records the first `wokwi-resistor` bounding box, sends a 120 px drag and
requires horizontal displacement greater than 60 px. The diagnostic sentence
"canvas froze" does not prove that the event loop froze: without pointer hit
targets/event traces or per-point timing, occlusion, missed gesture handling
and blocking remain distinguishable hypotheses, not established causes.

`SweepPanel` uses `runSweepAsync`; without a host sweep worker the fallback
yields between points, so a slow single point can still block. The PR did not
change those sweep/UI/test files; `src/main.jsx` changes engine imports to npm
paths. Engine `board.js`, `mna.js` and `sweep.js` are byte-identical between the
former sibling pin `a7f4cd356952cdb3765b9febf56979e6ee48e9a2` and `d7436dc`.
Neither P2 policy nor P3 GUI code was present in this failing run. There is no
evidence here of a policy regression, and no specific source fix is justified
without a targeted reproduction. Do not relabel the failed gate as green or
land the incomplete package migration to bypass it.
