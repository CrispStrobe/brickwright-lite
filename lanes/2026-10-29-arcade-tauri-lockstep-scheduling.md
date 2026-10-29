# Arcade qualification: isolate the preserved Tauri lockstep timing test

Status: ACTIVE — claim registration before implementation.
Owner: Arcade integration; Rust-source repair remains separately routed.
Isolated branch: `docs/arcade-tauri-lockstep-scheduling-20261029`.
Base: main `bea6ff04f43c4b053bf5f2bfd01bf21615fa7d8a`.

## Observed failure and hypothesis

The [Tauri unit job](https://github.com/CrispStrobe/brickwright-lite/actions/runs/40801257415/job/123209645340)
failed the existing
`renode_brick_state::tests::lockstep_steps_land_exactly_one_quantum_apart_without_polling`
test: fastest exchange 2.555585 ms against its 2.5 ms assertion, median
7.627335 ms. The remaining result was 269 passed and 11 ignored.
The tested Rust file has the same Git blob as current main. Its original failed
observation is retained; the cause is not established by a green main or source
identity alone.

The bounded hypothesis is that unrelated parallel tests interfere with this
wall-clock observation. Run the unchanged test once in a separate exact Cargo
invocation after the remaining default suite. Preserve its assertion, samples,
protocol checks and failure propagation. A successful isolated run establishes
only that execution; it is not a general latency guarantee or a Rust defect fix.

## Owned scope

- `.github/workflows/tauri.yml`: only the test job's default Cargo invocation
  boundary. Run every remaining default test, then exactly the named timing
  test once with one test thread. Keep all clippy, peers, e2e and firmware jobs,
  pinned Actions, dependencies, permissions and resource limits.
- `test/tauri-lockstep-test-scheduling.test.mjs`: source-policy controls for
  complete selection, exact identity, mandatory ordering and propagated failure.
  Ensure the isolated command cannot pass by selecting zero tests.
- This claim and `docs/ARCADE-AGENT-HANDOFF.md`.

Preserve the Rust source and all existing assertions. No retry, threshold,
timeout, baseline, pin, runtime/model or firmware change. Do not take over a
native/source lane. The older Ubuntu mirror-preparation claim owns a separate
step, which remains intact.

## Qualification and next step

Register this checked Markdown-only claim on canonical main before changing
implementation. Validate privacy, claim shape and exact parent/tree scope.
The implementation joins the normally pushed Arcade integration candidate;
do not dispatch an extra Rust run. Require the enabled exact-head hosted Cargo,
clippy and e2e checks, all other enabled product checks, and verified landing
parents/tree before merging product changes.

The [Rust test guide](https://doc.rust-lang.org/rustc/tests/) describes exact
selection and test-thread controls. The [libtest filter implementation](https://doc.rust-lang.org/stable/src/test/lib.rs.html#577)
also applies exact matching to exclusion filters. Source-policy controls must
preserve complete coverage when splitting the two invocations. If isolation
still fails, retain that original and return to the separately owned source
diagnosis; do not retry or relax the gate.
