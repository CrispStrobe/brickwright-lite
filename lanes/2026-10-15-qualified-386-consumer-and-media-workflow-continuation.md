## Qualified 386 consumer and media workflow continuation — 2026-10-15

CLAIM — Codex x86, staged implementation after merged ownership and board
qualification. Preserve PR961's coordinated supplier ownership; this claim
owns no package/lock/vendor/generated matrix pin update. Obtain a recorded
handoff before a later adoption change. Work follows the
[contract](docs/X86-NEXT-LANES.md#qualified-386-debugging-and-media-workflows).
Own focused debugger presentation in canonical overlay
`src/components/tw-pseudocode/{debug-drawer,debug-panel}.jsx`, additive
`src/lib/bw-debug/memory-view.js` and focused
`test/i80386-debugger-user-paths.test.mjs`. Paths under `src/` here are relative
to `overlay/scratch-gui`; tracked `packages/scratch-gui` mirrors follow the
repository's generation policy, never independent implementation.

A separately reviewed metadata extension in this section also owns canonical
`overlay/scratch-gui/src/lib/bw-debug/debug-capabilities.js` and its existing
`test/debug-capabilities.test.mjs` normalization controls. Preserve schema-1
legacy spaces; retain validated optional physical bounds/kind/read-size fields
without inferring them from code run-to. Absent metadata keeps legacy behavior;
presence of any new metadata field requires complete strict validation, so
partial or malformed descriptors fail closed. Lengths are nonnegative safe
integers; allow the one-past endpoint only for an empty read, not a byte or UI
jump/page start. Board target changes wait for PR599's
merge and explicit owner handoff, with a separate new board test.

Later in this same serialized lane, own new
`src/lib/bw-machines/raw-hdd-download.js`,
`test/i80386-hdd-download.test.mjs`, and a narrow export action in the already
owned debug panel; extend `scripts/verify-i80386-local-hdd-gui.mjs` for actual
download/reload acceptance. DOS package work owns new
`src/lib/bw-machines/{local-dos-package,dos-package-zip}.js`,
`test/local-dos-package.test.mjs`, a narrow package chooser in
`src/components/tw-pseudocode/machine-manager.jsx`, and new
`scripts/verify-dos-package-gui.mjs`. Claim any extra shared runner, further capability
schema, further board metadata or dependency changes separately before coding.
No private media, ISO picker, native addon backend or general OS claim.
