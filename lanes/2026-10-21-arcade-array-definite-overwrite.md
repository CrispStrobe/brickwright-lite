# Arcade occurrence-specific Array reset overwrite proof

Owner: Codex, Arcade compatibility lane.
Branch: `lane/arcade-array-overwrite-claim-20261021`.
Base: `7c15301f56d11041227d8ff30818184cd0b00f7c`.
Status: claim only; merge after all enabled exact-head checks succeed.

The canonical Array menu roundtrip now reaches genuine exported-file reimport.
Saved complete outputs show grouped inert local null initializers and root null
initializers overwritten inside actual startup calls. Existing immediate or
same-scope reset rules conservatively retain these null writers. Preserve that
failure and every real initializer, expression and evaluation order.

Own the narrow definite-overwrite proof in
`overlay/scratch-gui/src/lib/bw-makecode/array-reference-export-authority.js`,
a small private order-proof helper under that directory if needed, complete
`test/array-definite-overwrite.test.mjs`, the existing complete Array menu test,
corresponding qualification ledger consumer under an existing key only if
required, and Array/GUI handoff documentation. Coordinate with the same owner's
canonical-menu lane; no unrelated authority, runtime, SDK, dependency, vendor,
menu table, importer or emitter rewrite.

Discount only a particular reset writer whose value is proved overwritten
before the actual relevant occurrence on every admitted execution entry. Local
prologue proof must exclude earlier reads, aliases, capture, escape, unknown
effects and reentry. A stored/global RHS still needs its own initialized Array
and all-writer evidence; discarding a reset cannot mint Array/body authority.
A class call after the overwrite is not an exemption for class effects or
later writes. Cross-procedure globals need actual unique call/definition/args,
complete acyclic caller paths and a dominating unconditional overwrite before
any relevant use; never trust a startup name or another caller's overwrite.

Retain conditional/loop bypass, pre-overwrite use, callbacks, yields, recursion,
unknown calls, competing global writers, unrelated null/opaque writers and
source-currentness refusals. Do not remove guards on fresh Array publication or
class effects to make the captured examples pass. Cover real numeric/class
Array aliases through the outer Creator, Code and exact-file reimport, plus
meaningful negative controls for each excluded path. Keep all prior assertions
and all fourteen existing affected modules. Root runs complete new modules;
native/original-SDK, visible editing and corpus acceptance remain separate.
No new full-CI label, workflow dispatch or corpus-count change from this claim.
