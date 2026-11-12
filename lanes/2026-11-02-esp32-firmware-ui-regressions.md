# ESP32 firmware host integration regressions

Status: ACTIVE, 2026-11-02. Owner: ChatGPT ESP32 support lane, at CrispStrobe's request and under the explicit approval to fix, push and merge this task.

This is a bounded continuation of the merged firmware-entry and S040 consumer claim in PR1618 and `lanes/2026-11-01-esp32s3-firmware-boot.md`. The actual full run 41354530696 at the PR1622 integration reproduced three ambiguous global `.hex` file-picker selections, phone debugger control coverage, and empty-project debugger/wording failures. The M1 firmware gate itself passed 108 checks against the official artifact and pinned browser; those measurements keep their original source identity.

Own exact Code-Open picker binding in `scripts/verify-arcade-tilemap-painter.mjs`, `scripts/verify-arcade-tilemap-placement.mjs`, and `scripts/verify-arduboy.mjs`. The always-available firmware host adds a separate picker, so each existing game journey must exercise its intended Code import control.

Own diagnosis and repair of debugger visibility and control geometry in the already claimed `overlay/scratch-gui/src/components/tw-pseudocode/{circuit-tab,debug-panel}.jsx` and their normal mirrors, together with the corresponding `scripts/verify-controller-pane.mjs`, `scripts/verify-circuit-ux.mjs`, and focused source/lifetime controls. Reconcile old empty-project expectations with the explicitly approved real firmware picker while preserving useful empty-source guidance.

Preserve every journey's purpose, input image/program, thresholds, lifecycle and refusal checks; retain the persistent portal, CPX input ownership and Arcade semantics. Do not silence assertion failures, change shard selection, or expand into unrelated micro:bit, compiler, renderer or deployment work. Run the affected real browser journeys plus the firmware gates on the resulting actual build. Canonicalize this scope before implementation and retain the original failed CI evidence.
