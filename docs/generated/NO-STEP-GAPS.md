# Headless green-flag results

A project that waits for a controller, broadcast, sensor threshold, or clone can be valid even when green flag starts no thread. Missing opcodes and assets are separate conversion failures.

All five Arcade button-only snippets were run again with their required A/B key press: each started one thread with no VM block error. Their named unsupported calls, where present, still need implementations.

| projects | result |
|---:|---|
| 41 | waiting for an event |
| 14 | unsupported-blocks |
| 7 | external-extension-unverified |
| 3 | read-failed |
| 2 | missing-assets |
| 1 | parse-failed |

| file | result | cause |
|---|---|---|
| arcade-12904c83e83fe45a.ts | parse-failed | MakeCode TS: expected ) but found "" on line 6 |
| arcade-2581dc1efca91497.ts | waiting for an event | waits for controller button B |
| arcade-ae03d358339ddbe0.ts | waiting for an event | waits for controller button B |
| arcade-d8509d60f9807d87.ts | waiting for an event | waits for controller button A |
| arcade-db8b30332dc1be2c.ts | waiting for an event | waits for controller button A |
| arcade-faf260517b2744d5.ts | waiting for an event | waits for controller button A |
| broadcast_special_chars.sb3 | waiting for an event | no runnable startup event |
| cloud_variables_exceeded_limit.sb3 | waiting for an event | no runnable startup event |
| cloud_variables_limit.sb3 | waiting for an event | no runnable startup event |
| cloud_variables_local.sb3 | waiting for an event | no runnable startup event |
| cloud_variables_simple.sb3 | waiting for an event | no runnable startup event |
| comments_no_duplicate_id_serialization.sb3 | waiting for an event | no runnable startup event |
| corrupt_png.sb3 | waiting for an event | no runnable startup event |
| corrupt_sound.sb3 | waiting for an event | no runnable startup event |
| corrupt_svg.sb3 | read-failed | missing project.json |
| default.sb3 | waiting for an event | no runnable startup event |
| draggable.sb3 | waiting for an event | no runnable startup event |
| edge-triggered-hat.sb3 | waiting for an event | waits for event_whengreaterthan |
| tw-custom-report-repeat.sb3 | unsupported-blocks | missing opcodes: procedures_return |
| tw-procedure-return-non-existant.sb3 | unsupported-blocks | missing opcodes: procedures_return |
| tw-procedure-return-recursion.sb3 | unsupported-blocks | missing opcodes: procedures_return |
| tw-procedure-return-simple.sb3 | unsupported-blocks | missing opcodes: procedures_return |
| tw-procedure-return-stops-scripts.sb3 | unsupported-blocks | missing opcodes: procedures_return |
| tw-procedure-return-warp.sb3 | unsupported-blocks | missing opcodes: procedures_return |
| tw-repeat-procedure-reporter-infinite-analyzer-loop.sb3 | unsupported-blocks | missing opcodes: procedures_return |
| list-monitor-rename.sb3 | waiting for an event | no runnable startup event |
| ev3-simple-project.sb3 | waiting for an event | no runnable startup event |
| microbit-simple-project.sb3 | waiting for an event | no runnable startup event |
| music-simple-project.sb3 | waiting for an event | no runnable startup event |
| pen-simple-project.sb3 | waiting for an event | no runnable startup event |
| text2speech-simple-project.sb3 | waiting for an event | no runnable startup event |
| videoSensing-simple-project.sb3 | waiting for an event | no runnable startup event |
| wedo2-simple-project.sb3 | waiting for an event | no runnable startup event |
| missing_png.sb3 | missing-assets | missing assets: e1320c21995dcf6de10119be7f08c26b.png |
| missing_sound.sb3 | missing-assets | missing assets: 78618aadd225b1db7bf837fa17dc0568.wav |
| missing_svg.sb3 | read-failed | missing project.json |
| monitored_variables.sb3 | waiting for an event | no runnable startup event |
| origin-absent.sb3 | waiting for an event | no runnable startup event |
| origin.sb3 | read-failed | missing project.json |
| timer-monitor.sb3 | waiting for an event | no runnable startup event |
| top-level-reporters.sb3 | waiting for an event | no runnable startup event |
| tw-add-builtin-extension.sb3 | external-extension-unverified | requires external extension: testbuiltin_test |
| tw-addon-blocks.sb3 | unsupported-blocks | missing opcodes: procedures_return |
| tw-asset-progress.sb3 | waiting for an event | no runnable startup event |
| tw-beyond-branchCount.sb3 | external-extension-unverified | requires external extension: loopsAndThings_conditional |
| tw-block-returning-promise-like.sb3 | external-extension-unverified | requires external extension: testextension_test |
| tw-conditional.sb3 | unsupported-blocks | missing opcodes: procedures_return |
| tw-edge-activated-hat-returns-promise.sb3 | waiting for an event | waits for event_whengreaterthan |
| tw-empty-project.sb3 | waiting for an event | no runnable startup event |
| tw-extension-storage-no-data.sb3 | waiting for an event | no runnable startup event |
| tw-extension-storage.sb3 | unsupported-blocks | missing opcodes: test1_a, test2_a |
| tw-hats-and-events.sb3 | unsupported-blocks | missing opcodes: procedures_return |
| tw-loop.sb3 | unsupported-blocks | missing opcodes: procedures_return |
| tw-mixed-file-formats.sb3 | waiting for an event | no runnable startup event |
| tw-project-using-xml-extension.sb3 | external-extension-unverified | requires external extension: xmltest_opcode <>&"' |
| tw-project-with-extensions.sb3 | external-extension-unverified | requires external extension: Bitwise_bitwiseRightShift, fetch_get |
| tw-rejected-promise-command.sb3 | external-extension-unverified | requires external extension: test123_command |
| tw-rejected-promise-reporter.sb3 | external-extension-unverified | requires external extension: test123_reporter |
| tw-save-project-sb3.sb3 | waiting for an event | no runnable startup event |
| tw-serialize-asset-order.sb3 | waiting for an event | no runnable startup event |
| tw-slow-custom-reporter-stack-click.sb3 | unsupported-blocks | missing opcodes: procedures_return |
| tw-spork-custom-block-definition.sb3 | waiting for an event | no runnable startup event |
| empty-comment.sb3 | waiting for an event | no runnable startup event |
| no-comment.sb3 | waiting for an event | no runnable startup event |
| sprite.sb3 | waiting for an event | no runnable startup event |
| turbo-mode.sb3 | waiting for an event | no runnable startup event |
| tw-type-assertions.sb3 | unsupported-blocks | missing opcodes: procedures_return |
| tw-very-long-comments.sb3 | waiting for an event | no runnable startup event |
