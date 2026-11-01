# ESP32-S3 firmware boot integration

Status: CLAIMED, 2026-11-01. Owner: ChatGPT ESP32 support lane, at the request of CrispStrobe.
Base: `7ed9ae42f3d08187e9394b5ead0f956c97ec11ff`.

Complete the existing ESP32-S3 LabWired firmware path: admit explicit merged-flash input with chip identity, placement/capacity and pinned ROM provenance, pass it through the upstream bw-board factory, preserve the same boot inputs on reset, and expose correct serial/debug state in Lite. The retained engine already boots the tier-1 and Arduino fixtures directly; this lane qualifies the actual consumer route.

Own this claim; new focused ESP32 firmware/ROM loading helpers and tests; narrowly necessary `overlay/scratch-gui/src/components/tw-pseudocode/debug-panel.jsx` and `overlay/scratch-gui/src/lib/bw-debug/debug-runner.js` selection/import/attachment paths; an immutable ROM asset synchronizer and notices, including its additive build/Vercel sync steps beside the existing LabWired fetch; explicit capability wording; the ESP32 support plan; and direct exact supplier-pin adoption with required derived surfaces. Preserve other owners' Code-tab/Arcade work and the existing SAMD profile route. SAMD supplier PR721 and Lite PR1565 are confirmed merged; their older ACTIVE wording is not taken as permission to alter their feature.

Supplier boundary: bw-board adds an explicit S3 flash-boot profile and public-factory/reset/input validation under its companion claim. Shared behavior lands there first. LabWired RGB/ST7701/GT911 and the physical board art/UI are distinct companion scopes; their completion is not implied by this loader work.

Qualification: the existing S3 ELF odd-address breakpoint/resume regression; real retained Rust peripheral-probe and Arduino-compatible flash fixtures through the public factory and Lite browser path; reset and selected UART behavior; wrong-chip, missing-ROM, malformed/overlapping segment and unaddressed application-image refusals; truthful no-engine behavior; applicable exact pin, provenance, mirror, focused and hosted gates. Current proof is direct engine/factory only, with no 4848 display/touch or hardware-upload claim.

Use an isolated implementation branch. Recheck current remote ownership before overlapping changes. No forced ref update, unrelated scope takeover or weakened qualification gate.

Scope extension (2026-11-01): own only the empty-project firmware-entry guards in `overlay/scratch-gui/src/components/tw-pseudocode/circuit-tab.jsx` and its normal mirror so opening the debugger exposes its real file picker without PIN/PART declarations. Preserve the persistent portal, lazy-loading and CPX input ownership. Include target-control wrapping, truthful loaded/running wording, the real file-picker browser qualification, and its narrow CI registration. This extension is merged before those edits.
