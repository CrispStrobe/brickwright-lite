# ESP32 production-build resource option

Status: ACTIVE, 2026-11-02. Owner: ChatGPT ESP32 support lane, requested and approved by CrispStrobe as part of completing the firmware consumer.

The reviewed PR1622 production build exhausted this environment's 8 GiB memory limit in two recorded attempts. Its pinned Terser plugin derives eight workers from nine reported CPUs. A development-mode build does not establish production qualification, and repeating the same unbounded production attempt does not resolve that resource constraint.

Own only an optional `BW_MINIFIER_WORKERS` resource setting in `overlay/scratch-gui/webpack.config.js` and its normal package mirror, plus a focused build-equivalence/invalid-input control and this lane document. When explicitly set to a positive safe integer for a production build, use the same pinned Terser plugin and the same webpack default `compress.passes=2` settings with the requested worker count. Leave the absent-variable behavior and default CI configuration unchanged.

Preserve production mode, minimization, optimizer options, source maps, asset-preservation hooks, output and source/worker/engine byte admission. Do not spoof CPU reports, remove optimizations, alter the load gate or weaken any test. Prove matching emitted bytes for a small multi-chunk fixture under the default and single-worker settings, and reject invalid values. The final application still needs its real production build and browser journeys; a fixture comparison is not application qualification.

This bounded option is for resource scheduling only and does not authorize general webpack, compiler or dependency changes. Publish this claim before implementation.
