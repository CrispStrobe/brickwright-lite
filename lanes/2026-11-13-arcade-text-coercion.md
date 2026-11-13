# Arcade text receiver round-trip coercion

Status: local implementation candidate for review. This is a bounded E18
continuation; the broader cross-target fixed-point task remains open.

Scope: `export-arcade.js` text operands for length/character access, plus focused
source and actual runtime regressions. Preserve the existing addition helper
when its physical left input is empty String and its operator is `+`, and type
only that result as String. Other expressions retain their coercion.

Native Arrays addition and imported PXT source addition keep their distinct
conversion helpers. For `[12,3]`, native text conversion gives length 4 and
character `,`; unchanged PXT source conversion gives length 15 and character
`b`. The runtime tests compare each operation to its own original semantics.

Qualification: eleven source controls pass, including Number/non-addition/
dynamic-prefix refusals for both operation families. Six meaningful mutation
cuts fail. Three real runtime tests pass: native Array VM/exported PXT/fresh
SB3/reimport, effectful scalar VM/exported PXT/reimport, and unchanged source
Array original PXT/VM/exported PXT/reimport. Scalar source reaches byte identity
after its first export; Array receiver wrappers do not grow across three
reimports, while unrelated procedure-name drift remains open.

Limits: no whole E18, cross-target/corpus, browser editor, or exact-head CI
qualification. Repeated initializers and procedure-name drift are separate
work. No importer/runtime/pin/workflow changes; the closed Number-field
importer work remains separate.
