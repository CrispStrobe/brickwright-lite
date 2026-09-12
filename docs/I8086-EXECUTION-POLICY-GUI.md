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

Focused verification: Node 22.12.0, 17 tests passed with zero skips in policy,
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
