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

## Inferred member initializer follow-up

Actual String receiver flow now retains Number `.length` and String
`.charAt(index)` results in source scalar declarations. Unknown, mixed,
nullable, computed and argument-mutated receivers retain their refusals or
unknown result flow. This avoids synthetic saved-default initializer growth
without removing or moving an authored assignment or effect. Procedure naming
policy is unchanged.

The inferred scalar fixture reaches exact export byte identity over three
reimports. Focused and adjacent source controls pass. An affected original PXT,
actual VM, export/reimport and fresh SB3 test preserves separate receiver/index
effects over three generations. This is a bounded initializer repair, not whole
E18 closure. The distinct `text().charAt(index())` case still evaluates the index
before the receiver in the imported VM, unlike original PXT; that existing
order defect remains open and is excluded from the passing parity claim.


## Character receiver/index order follow-up

The imported `text().charAt(index())` now consumes its receiver before its
index using the existing lazy-value statement lowering, after PXT staging.
Both operands become invocation-local snapshots at the expression site;
neighboring operands, selected branches and loop tests retain their staging.
All calls, including entropy draws, count as ordered effects. A literal Number
index keeps its existing shape. The original method call retains String/domain
and arity admission. Effectful switch case labels requiring discarded prefixes
are explicitly refused; literal-safe labels remain supported.

Four focused source tests and adjacent E18/inference controls pass. Six private
mutation cuts fail. Actual original PXT, imported VM and three generations of
exported PXT, reimported VM and fresh saved SB3 preserve receiver/index order,
nested operands, skipped branches, loop continue, PXT conditional-argument
staging and receiver/index mutation. Omitted-index behavior is VM-only because
PXT requires an index. The lowering unit also preserves throwing callback
order; full source Throw-domain qualification is not claimed. Existing String
formal-producer refusals remain; no new callable/Throw capability is admitted.

No whole E18, cross-target/corpus, browser editor, entropy runtime parity or
hosted exact-head CI qualification is claimed by this bounded continuation.
