## Two-way GPIO pin block ⇄ Forth — 2026-10-12

DONE candidate — VPS Claude (opus), `lane/gpio-pin-block-20261012`.
Envelope: a new Lite-native `bwgpio` scratch-vm extension (`set pin` / `read pin`,
numeric pins 0–7) under `overlay/scratch-vm/src/extensions/crispstrobe/bwgpio/`,
its builtin registration in `overlay/scratch-vm/src/extension-support/extension-manager.js`,
the `LITE_ONLY` classification in `scripts/spike/bundled-upstream.mjs`, the
extension-library card in `overlay/scratch-gui/src/lib/libraries/extensions/index.jsx`,
the `bwgpio_setpin`/`bwgpio_readpin` text↔JSON mapping in
`overlay/scratch-gui/src/lib/sb3-creator.js`, the Forth generator cases in
`overlay/scratch-gui/src/lib/bw-lang/forth.js`, the tracked `packages/scratch-gui`
twins of those three files, and tests (`test/code-tab-forth.test.mjs`, new
`test/bwgpio-extension.test.mjs`); plus this ledger. Closes the half-broken pin
round-trip: a pin block now generates `N V pin!`, and the Forth reader's
`set pin N …` / `(read pin N)` now compile back to blocks, so DOS Forth GPIO
programs are fully two-way. The block drives the Widgets pane's GPIO strip
(bw-fpga-leds/bw-fpga-output) when a green-flag script runs it — the same pump
the Forth-on-DOS `onPortAccess` bridge uses. No dependency pin, compiler,
simulator, `forth.exe` or peer implementation change.
