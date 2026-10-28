# SAMD engine adoption handoff — updated 2026-10-28

**Consumer adoption is unfinished.** Continue existing
[PR1533](https://github.com/CrispStrobe/brickwright-lite/pull/1533), branch
`lane/samd-release-adoption-20261028`, head
`bb8a63216637ae827ded1e7836a199e65b1ef6b2`. Read
`lanes/2026-10-26-samd-native-game-engine-adoption.md` and `lanes/PROTOCOL.md`.
Do not start a duplicate lane. Refresh remote heads/checks before acting.

## Completed prerequisites

Core [PR262](https://github.com/CrispStrobe/labwired-core/pull/262) merged as
`3b655aef4085082152129c84849d4e2ad5004a7f` after fleet, selected guest and CLI
qualification. BW [PR711](https://github.com/CrispStrobe/bw-board/pull/711) merged
as `1f92a1aa85e808827a4c28b219bf11a572f07882` after12 successful enabled checks
and declared skips; reviewed parents and landed tree were verified.

The [immutable release](https://github.com/CrispStrobe/bw-board/releases/tag/labwired-wasm-3b655aef-locked)
has API `immutable: true`; all nine publisher digests match the retained qualified
originals. The earlier unlocked tag is preserved and is not the proposed pin.
Producer [40699886470](https://github.com/CrispStrobe/bw-board/actions/runs/40699886470)
passed two builds, determinism,125 existing tests and three active-game samples;
independent review checked565 files and51 RGB frames. Motion remains deferred.
See the [producer handoff](https://github.com/CrispStrobe/bw-board/blob/master/docs/SAMD-ENGINE-RELEASE-HANDOFF.md).
Infrastructure [PR1456](https://github.com/CrispStrobe/brickwright-lite/pull/1456)
merged as `dea504b32a9a4bd43a2a9d25b587590a0ac9763f`. The native-package owner
released the former PR1318-first hold for this exact adoption and its two claimed
repairs. No general package boundary is open.

## Current candidate and preserved failures

PR1533 changes engine/glue/profile identity in `scripts/sync-labwired-wasm.mjs`
and matching Node identity in `.github/workflows/target-performance.yml`.
No board/compiler/CUI package pin, native producer or compile default changes.

Original [run40734487998](https://github.com/CrispStrobe/brickwright-lite/actions/runs/40734487998)
failed unit6 historical-study controls. Its successful producing job also
minified the verified153114-byte glue to51263 bytes. Strict emitted-byte admission
refused it. Both failures and the acquired original remain retained; this
quarantined frontend must never feed native or actual-game acceptance.

The corrected candidate carries only the explicitly claimed repairs:

- Both tracked webpack configurations preserve exactly
  `static/labwired/labwired_wasm.js` through the existing copy hook. Existing
  content-addressed broker rules and unrelated minification remain intact.
  Four controls cover equality, near misses, mirror equality and omitted rules.
- The source owner's released three-path study repair seals four complete
  historical input files, isolates synthetic collector fixtures and retains the
  exact historical UI manifest. Original experiment pins, identity sources,
  thresholds, captures and intent stay unchanged. Current-pin/never-pinned
  guards stay strict elsewhere. Do not import the supplier's entire PR.

All88 focused Node22 controls passed with zero skips, including both formerly
failing collector cases. The retained
[five-target benchmark](https://github.com/CrispStrobe/brickwright-lite/actions/runs/40730146231)
passed its unchanged floor at source `317c069003803f9e8bfbe570ca7c371da6e52c10`;
its benchmark inputs are unchanged in the corrected candidate. These authored
core-loop ceilings do not qualify active-game or hardware speed.

## New native source gate failure

[Tauri40765450230](https://github.com/CrispStrobe/brickwright-lite/actions/runs/40765450230)
failed `renode_supervisor::tests::linux_owner_crash_terminates_simulator` at
`apps/tauri/src-tauri/src/renode_supervisor.rs:1838`: the test observed the
synthetic direct child surviving abrupt owner death after its existing
three-second observation bound. The suite reports269 passed,1 failed,11 ignored.
Its original log is retained once. The fixture and test are byte-identical to
original commit `3d77472b518ae4e9a57fd8cfb154e31ecba1b432`; SAMD changes no Rust.
The evidence does not establish a flake or distinguish termination failure from
an observation problem: the test retains neither terminal process state nor
process-start identity. No recorded repair has been found.

The guarded continuation was stopped before any native or actual-game dispatch.
**Do not dispatch from this candidate while this source gate is unresolved.**
Coordinate the existing SPIKE native-supervision claims before changing the
supervisor. First diagnose the owner-death signal and fixture observations with
bounded identity/state evidence. Keep the current timeout, failure, assertions,
normal ownership and teardown controls. A justified repair needs its claimed
scope, affected controls and clean guest qualification as applicable; do not
rerun the unchanged failure or widen the SAMD implementation silently.

The final-head historical-study source controls passed49 tests with zero skips
and the actual study job was correctly skipped. GUI infrastructure controls and
vendor checks also passed. The main Build remains queued at this checkpoint.

Test-only successor: the
[Linux observation claim](../lanes/2026-10-28-linux-owner-death-observation.md)
owns only the supervisor's test module; production bytes remain unchanged.
The candidate binds parent/group identity and a held process descriptor, requires
complete PID publication, retains bounded failure snapshots and signals only the
admitted child. The original three-second assertion stays intact. A negative
fixture observes the actual supervisor's kill signal before deliberately
clearing it and requiring survival through the same window, then exact cleanup.
Private extracted-method controls and three adversarial cuts passed; their
explicit synthetic supervisor boundary is not full Rust or guest qualification.
Full affected Rust CI and fresh actual SAMD acceptance still must pass on the
successor head. The original failure is not reclassified as a proven flake.
The separate current SPIKE delivery claim owns only MicroPython manifest hunks;
preserve those and the old dirty worktrees.

## Remaining work, in order

1. Qualify the test-only successor against the native source gate above, then
   refresh exact-head checks and existing
   [Build40765450222](https://github.com/CrispStrobe/brickwright-lite/actions/runs/40765450222).
   `ci:full` was restored before this final source checkpoint after an earlier
   removal; keep it present. Implementation bytes match the88-test candidate. Wait for every enabled check; do not duplicate
   live jobs or rerun a known unchanged failure. After successful overall Build,
   admit its single `build` job and `github-pages` artifact before one acquisition.
   Independently bind the actual checkout, complete frontend inventory and these
   SHA256s: glue `a29729658f267617e7d2539d756bd4dbe0662b25768348ecaeab723a9b032e1f`,
   WASM `1ad2947b99df8a13fce29c9240a79c61fb66e4d57ede26ca50880f141f3e3978`,
   profile `0fe1e72ae684153696efbca5874d2633007b92a9c9144f38cd62fdd28d030750`.
   Only declared Markdown composition may differ in the actual frontend checkout.
2. Dispatch `native-installed-qualification.yml` once with all three overrides:
   full reviewed `consumer`, its successful automatic `frontend_run`, and unchanged
   closed `compile_pins` defaults from the reviewed producer. Independently audit
   the successful executable/receipt; do not rebuild an original to inspect it.
3. Dispatch `samd-native-game-qualification.yml` once with the same `consumer`,
   `frontend_run`, admitted `native_run`, producer run `40699886470` and producer
   head `8ea3767903d5135f4bd1e74914e25663b530d502`. Require admission plus three
   fresh actual Chromium and three installed Tauri/WebKit instances. Independently
   audit raw RGB movement, actual press/release, sampled RSS and source/package
   joins. No native or actual-game dispatch has occurred at this checkpoint.
4. After every enabled final-head check and affected guest acceptance succeeds,
   merge PR1533 normally with `--match-head-commit`; verify predicted/landed
   parents and tree. Notify the native-package owner of the qualified landed
   identity, update this handoff and close the existing claim. Preserve failures;
   never relax assertions or silently change a dependency pin to land.

Retain BW's narrow Node22 `--no-turbo-inline-js-wasm-calls` workaround where
required for its V8 Deoptimizer crash. The observer canvas is a controller-memory
view. A normal native SAMD compile/import/export/GUI route, active-game real-time
playability and physical panel/electrical/silicon qualification remain separate
scope. Keep private evidence and operational details outside public files/logs.
