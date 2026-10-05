# Conversion compatibility audit

Generated 2026-09-27T18:02:31.310Z; 131 files. A parsed project has not necessarily run correctly.

| count | stage |
|---:|---|
| 105 | parsed |
| 14 | unsupported-blocks |
| 7 | external-extension-unverified |
| 3 | read-failed |
| 2 | missing-assets |

## Unsupported MakeCode elements

| occurrences | element |
|---:|---|
| 0 | none |

## Missing Scratch/TurboWarp opcodes

| occurrences | opcode |
|---:|---|
| 13 | procedures_return |
| 1 | test1_a |
| 1 | test2_a |

## Unsupported block modes

| occurrences | mode |
|---:|---|
| 0 | none |

## External extensions requiring runtime validation or an offline implementation

| projects | extension and URL |
|---:|---|
| 2 | loopsAndThings: http://localhost:8000/test/loops.js |
| 2 | test123: embedded data URL (1181 characters; full URL in JSON report) |
| 1 | Bitwise: https://extensions.turbowarp.org/bitwise.js |
| 1 | fetch: https://extensions.turbowarp.org/fetch.js |
| 1 | loopsAndThings: embedded data URL (4419 characters; full URL in JSON report) |
| 1 | testbuiltin: embedded data URL (662 characters; full URL in JSON report) |
| 1 | testextension: embedded data URL (1538 characters; full URL in JSON report) |
| 1 | testpredicate: embedded data URL (3450 characters; full URL in JSON report) |
| 1 | typeassert: embedded data URL (3850 characters; full URL in JSON report) |
| 1 | xmltest: http://localhost:8000/test/xml.js |

### Their unverified opcodes

| projects | opcode |
|---:|---|
| 2 | loopsAndThings_conditional |
| 1 | Bitwise_bitwiseRightShift |
| 1 | fetch_get |
| 1 | loopsAndThings_loop |
| 1 | loopsAndThings_testPromise |
| 1 | test123_command |
| 1 | test123_reporter |
| 1 | testbuiltin_test |
| 1 | testextension_test |
| 1 | testpredicate_clickme |
| 1 | testpredicate_complexhat |
| 1 | testpredicate_event |
| 1 | testpredicate_hat |
| 1 | typeassert_assert |
| 1 | typeassert_region |
| 1 | xmltest_opcode <>&"' |

## Failures and execution limits

| file | result |
|---|---|
| /mnt/storage/brickwright-corpora/turbowarp-scratch-vm/test/fixtures/broadcast_special_chars.sb3 | no-green-flag-thread |
| /mnt/storage/brickwright-corpora/turbowarp-scratch-vm/test/fixtures/cloud_variables_exceeded_limit.sb3 | no-green-flag-thread |
| /mnt/storage/brickwright-corpora/turbowarp-scratch-vm/test/fixtures/cloud_variables_limit.sb3 | no-green-flag-thread |
| /mnt/storage/brickwright-corpora/turbowarp-scratch-vm/test/fixtures/cloud_variables_local.sb3 | no-green-flag-thread |
| /mnt/storage/brickwright-corpora/turbowarp-scratch-vm/test/fixtures/cloud_variables_simple.sb3 | no-green-flag-thread |
| /mnt/storage/brickwright-corpora/turbowarp-scratch-vm/test/fixtures/comments_no_duplicate_id_serialization.sb3 | no-green-flag-thread |
| /mnt/storage/brickwright-corpora/turbowarp-scratch-vm/test/fixtures/corrupt_png.sb3 | no-green-flag-thread |
| /mnt/storage/brickwright-corpora/turbowarp-scratch-vm/test/fixtures/corrupt_sound.sb3 | no-green-flag-thread |
| /mnt/storage/brickwright-corpora/turbowarp-scratch-vm/test/fixtures/corrupt_svg.sb3 | missing project.json |
| /mnt/storage/brickwright-corpora/turbowarp-scratch-vm/test/fixtures/default.sb3 | no-green-flag-thread |
| /mnt/storage/brickwright-corpora/turbowarp-scratch-vm/test/fixtures/draggable.sb3 | no-green-flag-thread |
| /mnt/storage/brickwright-corpora/turbowarp-scratch-vm/test/fixtures/edge-triggered-hat.sb3 | no-green-flag-thread |
| /mnt/storage/brickwright-corpora/turbowarp-scratch-vm/test/fixtures/list-monitor-rename.sb3 | no-green-flag-thread |
| /mnt/storage/brickwright-corpora/turbowarp-scratch-vm/test/fixtures/load-extensions/confirm-load/ev3-simple-project.sb3 | no-green-flag-thread |
| /mnt/storage/brickwright-corpora/turbowarp-scratch-vm/test/fixtures/load-extensions/confirm-load/microbit-simple-project.sb3 | no-green-flag-thread |
| /mnt/storage/brickwright-corpora/turbowarp-scratch-vm/test/fixtures/load-extensions/confirm-load/music-simple-project.sb3 | no-green-flag-thread |
| /mnt/storage/brickwright-corpora/turbowarp-scratch-vm/test/fixtures/load-extensions/confirm-load/pen-simple-project.sb3 | no-green-flag-thread |
| /mnt/storage/brickwright-corpora/turbowarp-scratch-vm/test/fixtures/load-extensions/confirm-load/text2speech-simple-project.sb3 | no-green-flag-thread |
| /mnt/storage/brickwright-corpora/turbowarp-scratch-vm/test/fixtures/load-extensions/confirm-load/videoSensing-simple-project.sb3 | no-green-flag-thread |
| /mnt/storage/brickwright-corpora/turbowarp-scratch-vm/test/fixtures/load-extensions/confirm-load/wedo2-simple-project.sb3 | no-green-flag-thread |
| /mnt/storage/brickwright-corpora/turbowarp-scratch-vm/test/fixtures/missing_svg.sb3 | missing project.json |
| /mnt/storage/brickwright-corpora/turbowarp-scratch-vm/test/fixtures/monitored_variables.sb3 | no-green-flag-thread |
| /mnt/storage/brickwright-corpora/turbowarp-scratch-vm/test/fixtures/origin-absent.sb3 | no-green-flag-thread |
| /mnt/storage/brickwright-corpora/turbowarp-scratch-vm/test/fixtures/origin.sb3 | missing project.json |
| /mnt/storage/brickwright-corpora/turbowarp-scratch-vm/test/fixtures/timer-monitor.sb3 | no-green-flag-thread |
| /mnt/storage/brickwright-corpora/turbowarp-scratch-vm/test/fixtures/top-level-reporters.sb3 | no-green-flag-thread |
| /mnt/storage/brickwright-corpora/turbowarp-scratch-vm/test/fixtures/tw-asset-progress.sb3 | no-green-flag-thread |
| /mnt/storage/brickwright-corpora/turbowarp-scratch-vm/test/fixtures/tw-edge-activated-hat-returns-promise.sb3 | no-green-flag-thread |
| /mnt/storage/brickwright-corpora/turbowarp-scratch-vm/test/fixtures/tw-empty-project.sb3 | no-green-flag-thread |
| /mnt/storage/brickwright-corpora/turbowarp-scratch-vm/test/fixtures/tw-extension-storage-no-data.sb3 | no-green-flag-thread |
| /mnt/storage/brickwright-corpora/turbowarp-scratch-vm/test/fixtures/tw-mixed-file-formats.sb3 | no-green-flag-thread |
| /mnt/storage/brickwright-corpora/turbowarp-scratch-vm/test/fixtures/tw-save-project-sb3.sb3 | no-green-flag-thread |
| /mnt/storage/brickwright-corpora/turbowarp-scratch-vm/test/fixtures/tw-serialize-asset-order.sb3 | no-green-flag-thread |
| /mnt/storage/brickwright-corpora/turbowarp-scratch-vm/test/fixtures/tw-spork-custom-block-definition.sb3 | no-green-flag-thread |
| /mnt/storage/brickwright-corpora/turbowarp-scratch-vm/test/fixtures/tw-stored-settings/empty-comment.sb3 | no-green-flag-thread |
| /mnt/storage/brickwright-corpora/turbowarp-scratch-vm/test/fixtures/tw-stored-settings/no-comment.sb3 | no-green-flag-thread |
| /mnt/storage/brickwright-corpora/turbowarp-scratch-vm/test/fixtures/tw-stored-settings/sprite.sb3 | no-green-flag-thread |
| /mnt/storage/brickwright-corpora/turbowarp-scratch-vm/test/fixtures/tw-stored-settings/turbo-mode.sb3 | no-green-flag-thread |
| /mnt/storage/brickwright-corpora/turbowarp-scratch-vm/test/fixtures/tw-very-long-comments.sb3 | no-green-flag-thread |
