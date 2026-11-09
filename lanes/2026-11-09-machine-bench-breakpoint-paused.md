# Machine-bench breakpoint hits publish "paused"

Owner: x86 GUI lane (Claude Code agent for the repository owner). Claim and
change in one PR.

`wireMachineBench` (i8086/i80386/Z80/6502 benches) created its debug session
with `onHalt`/`onRun` callbacks, which bw-board's `createDebugSession` never
calls; it reports through `onChange` only. A code breakpoint halted the target
and stopped the pump, but no snapshot followed, so the panel kept showing
"running" until an unrelated click re-rendered it. Found by the 386
forward-debug probe (row 0x7C13 set, Run, never paused).

Paths: `overlay/` and `packages/` copies of
`scratch-gui/src/lib/bw-debug/debug-runner.js` (the session options in
`wireMachineBench` only) and new
`test/debug-bench-breakpoint-publishes-paused.test.mjs`: a Z80 bench loop with
explicit pause, resume and a breakpoint hit that must publish "paused" with no
other UI action, plus an executed mutant restoring the old wiring that must
fail. Explicit pause/resume behaviour is unchanged.
