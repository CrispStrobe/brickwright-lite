# CI Pyodide setup without duplicate measurements — DONE (source candidate)

Owner: Codex school/performance delivery, isolated
`lane/safari-jolt-simd-20261021`, based on `fd61f8c1e`.

The final performance unit shard passed all 3,270 ordinary tests but its
four-minute Pyodide setup step timed out. That setup invokes the developer
probe's `--install` mode, which also loads the Python runtime and measures both
designs before returning. Setup should install the tool; the existing actual
packer tests remain responsible for byte identity with the native bitstreams.

Own `scripts/probe-pyodide-packer.mjs`, only the two Pyodide setup command lines
in `.github/workflows/build.yml`, a focused CLI/process regression test and this
claim. Add an explicit install-only mode and keep its child installation bounded
inside the existing four-minute setup allowance. Preserve the developer
measurement modes, actual packer implementation, package selection, native
fixture hashes, workflow limits, failure assertions and existing named-absence
policy. No new skip, relaxed gate, larger budget, UI change or hardware action.

Merge this claim before implementation. Prove that setup never executes a
measurement, existing measurement modes still do, and a stalled installer is
terminated and reported before the existing outer deadline. Retain the original
timeout and all actual packer checks; qualify the composed final source and
normal merge.

The setup now uses `--install-only`, with a three-minute child-install deadline
inside the unchanged four-minute workflow allowance. Existing developer
measurement modes and both real packer tests remain intact. Four regressions
fail on the old behavior; all five focused controls pass with the repair.
Workflow/census and gate-shape controls pass. A real install-only execution
succeeds, and the actual packer produces both recorded native bitstream hashes;
the existing WasmGC independence precondition is unchanged. Final composed
hosted qualification remains required.
