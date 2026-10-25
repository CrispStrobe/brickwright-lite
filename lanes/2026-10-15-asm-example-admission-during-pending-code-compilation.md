## ASM example admission during pending Code compilation — 2026-10-15

DONE — Codex circuit/instrument adoption owner, bounded blocker repair for
PR965. Base `dccfd176b0043128b6a723e55f80a5e3b47fed4c`; isolated branch
`docs/asm-example-serialization-claim-20261015` publishes ownership first.
Production edits wait for this claim's merge and coordination with the A11
owner of other blocks in the importer. Original exact-head Build38726686250
failed only the 8086 browser journey after retarget/reload: its screenshot
shows empty ASM and disabled Assemble. Pure actual-method/deferred-VM controls
reproduce an example accepted during compile and then erased by its completion.
This is not an engine or physical qualification.

Envelope: this ledger; only `loadAsmExample` busy admission, including after
asynchronous confirmation, and the ASM example picker's disabled state in
`overlay/scratch-gui/src/components/tw-pseudocode/pseudocode-importer.jsx`;
its tracked `packages/scratch-gui` twin; new
`test/asm-example-serialization.test.mjs`; and
`scripts/verify-i8086-browser.mjs` for a deterministic pending-compile witness.
Do not change `setDevice`, `compile`, MakeCode/export/device-routing blocks,
engine models, dependency pins, timeouts, compiler interception or other lanes.
PR965's already qualified CUI adoption bytes remain unchanged.

Combined qualification contract (2026-10-16): the original busy-refusal
candidate passed its exact-head controls, but the newer merged editor-ownership
fix in PR998 accepts newer editor requests while a previous VM load completes.
The UI picker stays disabled during compilation. An already accepted direct
method request instead replaces editor buffers immediately; the unchanged
compiler ownership fence preserves that buffer and its feedback across old
load success, refresh and error. No VM-loading method is changed here.

Require actual-method controls for immediate accepted buffer ownership,
confirmation refusal, ordinary idle loading and confirmation overlapping busy
work. A buffer-publication mutation must fail; preserve PR998's success/error/
refresh ownership controls unchanged. The actual browser proof holds only the
return of a real completed VM load, observes the disabled picker, accepts one
direct newer editor request, releases/restores the wrapper and proves exact
buffer identity/source/feedback survive. Then assemble through ordinary controls.
Removing the picker guard must fail the held-state assertion. Retain the entire
keyboard/CGA/8255/refusal/reload journey and all exact-head checks. No forced
click, timeout increase, omitted scenario or invented guest. Original refusal
results and the first integration conflicts remain separate historical evidence.
Fresh combined hosted qualification remains required before landing.
