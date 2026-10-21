# Safari nominal-speed program-clock pacing — CLAIMED

Owner: Codex school/performance delivery, isolated
`lane/safari-jolt-simd-20261021`, based on `b48f7685d`.

The qualified SIMD engine reduces moving-chess physics work substantially, but
WebKit's exact 1× run remains around 0.915×. At 1× the program clock currently
uses the browser's VM interval; other speeds already use elapsed-wall deadlines
and request the next VM step cooperatively. A private diagnostic near 1× removes
that pacing ceiling without changing the physics interval.

Own `overlay/scratch-gui/src/lib/bw-sim/sim-clock.js`, the clock construction in
`overlay/scratch-gui/src/components/tw-pseudocode/sim-lab-pane.jsx`, their canonical
integrated mirrors, `test/bw-sim-slow-motion.test.mjs`,
`test/bw-sim-program-clock.test.mjs`, focused nominal-pacing controls and this
claim. Opt the browser pane into deadline pacing at exactly 1× while preserving
the existing default contract for other clock callers. Reuse the established
cooperative step and elapsed-wall pacing machinery.

Merge this claim before implementation. Preserve fixed physics intervals,
program/world time agreement, timer order, stop/uninstall generations, slow
motion, fast forward and worker backpressure. Qualify the current behavior's
failure under a quantized VM interval and the repaired exact-1× path, then run
the real moving program in WebKit and Chromium. Keep measured RTF truthful;
no near-1 speed setting, timer-only benchmark or changed resource/numerical
budget may stand in for production qualification. No model, force, collision,
physics-worker, hardware, workflow or other owner's source is in scope.
