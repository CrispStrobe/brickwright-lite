# ESP32-S3 firmware boot integration

Status: CLAIMED, 2026-11-01. Owner: ChatGPT ESP32 support lane, at the request of CrispStrobe.
Base: `7ed9ae42f3d08187e9394b5ead0f956c97ec11ff`.

Complete the existing ESP32-S3 LabWired firmware path: admit explicit merged-flash input with chip identity, placement/capacity and pinned ROM provenance, pass it through the upstream bw-board factory, preserve the same boot inputs on reset, and expose correct serial/debug state in Lite. The retained engine already boots the tier-1 and Arduino fixtures directly; this lane qualifies the actual consumer route.

Own this claim; new focused ESP32 firmware/ROM loading helpers and tests; narrowly necessary `overlay/scratch-gui/src/components/tw-pseudocode/debug-panel.jsx` and `overlay/scratch-gui/src/lib/bw-debug/debug-runner.js` selection/import/attachment paths; an immutable ROM asset synchronizer and notices, including its additive build/Vercel sync steps beside the existing LabWired fetch; explicit capability wording; the ESP32 support plan; and direct exact supplier-pin adoption with required derived surfaces. Preserve other owners' Code-tab/Arcade work and the existing SAMD profile route. SAMD supplier PR721 and Lite PR1565 are confirmed merged; their older ACTIVE wording is not taken as permission to alter their feature.

Supplier boundary: bw-board adds an explicit S3 flash-boot profile and public-factory/reset/input validation under its companion claim. Shared behavior lands there first. LabWired RGB/ST7701/GT911 and the physical board art/UI are distinct companion scopes; their completion is not implied by this loader work.

Qualification: the existing S3 ELF odd-address breakpoint/resume regression; real retained Rust peripheral-probe and Arduino-compatible flash fixtures through the public factory and Lite browser path; reset and selected UART behavior; wrong-chip, missing-ROM, malformed/overlapping segment and unaddressed application-image refusals; truthful no-engine behavior; applicable exact pin, provenance, mirror, focused and hosted gates. Current proof is direct engine/factory only, with no 4848 display/touch or hardware-upload claim.

Use an isolated implementation branch. Recheck current remote ownership before overlapping changes. No forced ref update, unrelated scope takeover or weakened qualification gate.

Scope extension (2026-11-01): own only the empty-project firmware-entry guards in `overlay/scratch-gui/src/components/tw-pseudocode/circuit-tab.jsx` and its normal mirror so opening the debugger exposes its real file picker without PIN/PART declarations. Preserve the persistent portal, lazy-loading and CPX input ownership. Include target-control wrapping, truthful loaded/running wording, the real file-picker browser qualification, and its narrow CI registration. This extension is merged before those edits.

Adoption-scope extension and correction (2026-11-01): the original extension classified the F10 Board/CUI bindings as historical and promised unchanged producer/reader/control bytes. The hosted canonical-input control disproved that classification: F10 maps and selected CUI witnesses bind current suppliers, while F7/F8/F9 constants and measurements retain their historical meanings. The authorized pin-adoption repair owns only the live F10 Board/CUI map entries and changed CUI witness rows in the producer and reader, the dependent current-pin assertion, strict current-input enforcement and focused refusal controls in `test/pin-move-chain.test.mjs`, and exact source-profile/admission-inventory hash rebinding. Preserve all historical constants, witness maps, receipts, validators, workflow bytes and activation flags. Never admit a whole file by role or relabel old measurements as current qualification. Prove that stale current bindings and copied, extra, moved, encoded, never-shipped and wrong-supplier historical occurrences fail. This correction narrows the current-input repair within the merged pin-adoption claim; it authorizes no x86 execution event, new qualification result or gate waiver.

Recovery (2026-11-01): the archived implementation tree `26e4ea0be1b6d74b048a94308e7b695047d90e86` was verified against its complete binary patch, then applied to the current main while preserving the merged scope extensions. The archived browser run remains historical evidence. M1 supplier PR722 has landed at `cf42ddbd5a98acac64973e972024376dd72cb80b`; its full CI run `41321569528` and dedicated firmware run `41321569555` pass at that exact head. Current continuation will qualify the empty-project entry, consumer binding and historical-pin handling before promotion from draft review.

Continuation (2026-11-01): the owner explicitly approved necessary direct pushes
or merges, the exact core drift acknowledgement and bounded recapture date, and
repair of the independent host check. The empty-project guard is removed while
preserving the persistent debugger portal. The M1 browser verifier now opens the
picker without authoring a program, and both firmware browser gates are assigned
to the heavy shard with retained evidence and exact terminal-audit bindings.
The 18 workflow-partition/scope controls pass. The historical-pin occurrence
protections, strict live F10 adoption and deterministic provenance updates are
implemented. Both real
package installations now pass exact Git/npm-pack content and single-engine
resolution verification; notices, reports and mirrors pass. Seven provenance
controls keep retained firmware/ROM source independent of the current engine
release identity. Post-commit history and fresh built-application qualification
remain required. No historical browser receipt or frozen x86 execution evidence
was rewritten as a new pass.

Main integration (2026-11-01): preserve the subsequently landed tilemap and
micro:bit work from `ef32d9aba3665db3f261c5ab44c8620aa644d635`, including
sb3-creator `17d06522ed71aac05364b80b075372acf3947d92` and microbitplus
`80092dbf4fb29b86dd0a312ae138ff24495ae8d7`, while retaining this lane's landed
Board/CUI pins. Both npm locks are unchanged. That merge preserved main's source
and admission inventory bytes. The subsequent hosted current-input failure
requires the narrow live F10 repair described above and exact body-hash
rebinding; historical fields and measured evidence remain unchanged.
Qualification of the integrated head is recorded separately from the first
published candidate `73ee01ec874e2a0e66bf5b2b258ace4cce628447`.

Second main integration (2026-11-01): compose
`2909b165b6d26888e85f228664e3e06c3302989c` and its micro:bit radio, serial,
board-control and data-logger work. Preserve its sb3-creator
`ab47b412f4e0379f1feec47531e7e12e74e1cbf9` and microbitplus
`6385f0a7f93c30897b2cd8c3cff2f0348b08eb1f` pins alongside the adopted Board/CUI
pins and six current CUI witness updates. F10's live SB3 entry follows main;
only the corresponding producer/reader source profiles and admission hash pairs
are rebound. Historical fields, validators, workflow bytes, activation flags and
npm locks remain unchanged. Run the existing 82 manufactured controls and the
complete-history pin audit on the combined source; no earlier qualification is
transferred to it.

Browser follow-up (2026-11-01): the original full CI on `fc5dd80a` passed the
actual M1 journey and exposed five light-shard failures. Three legacy Code Open
probes now scope their existing `.hex` input to the public Open control, keeping
strict uniqueness. CircuitTab now remembers controller/device pane selections
and leaves their stage column clear while retaining the same keyed debugger
portal and runner. A nonblocking, localized empty-image status reports the idle
debugger's actual input state and disappears when firmware or boot media exists;
the Circuit UX and M1 journeys assert that behavior. The firmware picker remains
available without a program declaration.

Qualification of these narrow follow-ups: 36 existing lifecycle/ownership/S040
cases, 14 actual-component cases and 11 gate-shape controls pass without skips.
Five executable negative cuts fail their corresponding pane/status contracts.
The pinned Chromium observer also passes 13 isolated Code Open selector cases
and 32 dock/viewport/loading observations with unchanged runner ownership. Those
targeted diagnostics are separate from a fresh full-application run, which is
required after the qualified supplier adoption. The original CI failures and
the earlier 108-check M1 report retain their original source/engine identities.

Qualified supplier adoption (2026-11-02): the immutable
`labwired-wasm-9c420649` release passed run `41359378516` at producer
`1c9ed301819f21bdab9fc5c0fb35e82d858e821d`. Board PR723 is merged at
`cda9d13b3e5b4a3e40854f45e04d110ab2a57ef3`; landed ordinary CI `41374193811`,
S040 `41374193796` and M1 `41374193817` pass. The consumer adopts those exact
qualified inputs through its normal package installation, generators and
provenance checks. Retained S3 firmware and ROM sources remain separately
identified. CUI remains `380dc8b7b51e10726035b77f775d753152f9a885`.

The current performance workflow's Core checkout, release tag and two Node
asset hashes follow this qualified engine. Its triggers, budgets, benchmark
source and pass criteria are preserved. Only the corresponding reviewed
current-workflow body digest and dependent source profile are rebound; previous
performance measurements and historical workflow identities keep their original
meaning. The combined application still requires fresh official build, browser,
SAMD installed-native and applicable hosted qualification before promotion.
