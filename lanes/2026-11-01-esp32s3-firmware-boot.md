# ESP32-S3 firmware boot integration

Status: CLAIMED, 2026-11-01. Owner: ChatGPT ESP32 support lane, at the request of CrispStrobe.
Base: `7ed9ae42f3d08187e9394b5ead0f956c97ec11ff`.

Complete the existing ESP32-S3 LabWired firmware path: admit explicit merged-flash input with chip identity, placement/capacity and pinned ROM provenance, pass it through the upstream bw-board factory, preserve the same boot inputs on reset, and expose correct serial/debug state in Lite. The retained engine already boots the tier-1 and Arduino fixtures directly; this lane qualifies the actual consumer route.

Own this claim; new focused ESP32 firmware/ROM loading helpers and tests; narrowly necessary `overlay/scratch-gui/src/components/tw-pseudocode/debug-panel.jsx` and `overlay/scratch-gui/src/lib/bw-debug/debug-runner.js` selection/import/attachment paths; an immutable ROM asset synchronizer and notices, including its additive build/Vercel sync steps beside the existing LabWired fetch; explicit capability wording; the ESP32 support plan; and direct exact supplier-pin adoption with required derived surfaces. Preserve other owners' Code-tab/Arcade work and the existing SAMD profile route. SAMD supplier PR721 and Lite PR1565 are confirmed merged; their older ACTIVE wording is not taken as permission to alter their feature.

Supplier boundary: bw-board adds an explicit S3 flash-boot profile and public-factory/reset/input validation under its companion claim. Shared behavior lands there first. LabWired RGB/ST7701/GT911 and the physical board art/UI are distinct companion scopes; their completion is not implied by this loader work.

Qualification: the existing S3 ELF odd-address breakpoint/resume regression; real retained Rust peripheral-probe and Arduino-compatible flash fixtures through the public factory and Lite browser path; reset and selected UART behavior; wrong-chip, missing-ROM, malformed/overlapping segment and unaddressed application-image refusals; truthful no-engine behavior; applicable exact pin, provenance, mirror, focused and hosted gates. Current proof is direct engine/factory only, with no 4848 display/touch or hardware-upload claim.

Use an isolated implementation branch. Recheck current remote ownership before overlapping changes. No forced ref update, unrelated scope takeover or weakened qualification gate.

Scope extension (2026-11-01): own only the empty-project firmware-entry guards in `overlay/scratch-gui/src/components/tw-pseudocode/circuit-tab.jsx` and its normal mirror so opening the debugger exposes its real file picker without PIN/PART declarations. Preserve the persistent portal, lazy-loading and CPX input ownership. Include target-control wrapping, truthful loaded/running wording, the real file-picker browser qualification, and its narrow CI registration. This extension is merged before those edits.

Adoption-scope extension (2026-11-01): the complete-history pin audit at the M1 review pin reports 35 passing and two failing cases because its F10 historical-role policy requires the previous bw-board pin to remain current. Own only the necessary occurrence-level historical-role handling and focused negative controls in `test/pin-move-chain.test.mjs`, plus an exact admission-inventory rebind only if required by its existing byte/mode/blob validator. Preserve the frozen x86 producer, reader, workflow, controls, measured receipts and original supplier identities byte-for-byte. Do not relabel old measurements as current qualification or admit a whole file by role. Prove that copied, extra, moved, encoded and never-shipped pin occurrences still fail. This policy extension requires its canonical merged claim before implementation; it does not authorize an x86 execution event, a new qualification result, or any gate waiver.

Recovery (2026-11-01): the archived implementation tree `26e4ea0be1b6d74b048a94308e7b695047d90e86` was verified against its complete binary patch, then applied to the current main while preserving the merged scope extensions. The archived browser run remains historical evidence. M1 supplier PR722 has landed at `cf42ddbd5a98acac64973e972024376dd72cb80b`; its full CI run `41321569528` and dedicated firmware run `41321569555` pass at that exact head. Current continuation will qualify the empty-project entry, consumer binding and historical-pin handling before promotion from draft review.

Continuation (2026-11-01): the owner explicitly approved necessary direct pushes
or merges, the exact core drift acknowledgement and bounded recapture date, and
repair of the independent host check. The empty-project guard is removed while
preserving the persistent debugger portal. The M1 browser verifier now opens the
picker without authoring a program, and both firmware browser gates are assigned
to the heavy shard with retained evidence and exact terminal-audit bindings.
The 18 workflow-partition/scope controls pass. The narrow frozen historical-pin
role policy and deterministic provenance updates are implemented. Both real
package installations now pass exact Git/npm-pack content and single-engine
resolution verification; notices, reports and mirrors pass. Seven provenance
controls keep retained firmware/ROM source independent of the current engine
release identity. Post-commit history and fresh built-application qualification
remain required. No historical browser receipt or frozen x86 execution evidence
was rewritten as a new pass.
