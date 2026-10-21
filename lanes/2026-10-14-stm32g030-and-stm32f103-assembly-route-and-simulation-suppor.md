## STM32G030 and STM32F103 assembly route and simulation support — 2026-10-14

CLAIM — VPS Claude, branch lane/arm-stm32-g030-f103, exact base 3958a28fefc39345fb42a878727f528f76dfd53a, isolated worktree wt-lite-stm32-20261014.
Upstreams merged: stc-compiler PR #19 (c3a069b), sb3-creator PR #145 (9e5b18f), bw-board PR #584 (58ee2828).
Scope:
- overlay/scratch-gui/src/lib/bw-asm/assemble-route.js: map stm32g030 and stm32f103 devices to compiler targets.
- overlay/scratch-gui/src/lib/bw-asm/arm-image.js: add stm32g030 (origin 0x08000000, kind 'stm32g0') to ARM_ASM_RUN.
- overlay/scratch-gui/src/lib/bw-debug/debug-runner.js: support stm32g0 target kind and default 64 MHz clock.
- test/arm-asm-run.test.mjs: verify stm32g030 and stm32f103 routing, simulation engines, and download-only status.
- LANES.md claim.
