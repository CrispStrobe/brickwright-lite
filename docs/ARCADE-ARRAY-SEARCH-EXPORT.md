# Typed array search export

BrickWright array queries can search for a value outside the collection's element
type. The selected Arcade SDK rejects that needle statically for a typed array,
even though its runtime searches by strict identity and returns no match.

Arcade export places an erased static view on the **needle only** for `indexOf`
and `removeElement`. The collection retains its inferred or declared element
type, aliases and original storage. The export neither copies the array nor
changes insertion or assignment typing. Queries and removals do not introduce
element-type constraints.

For imported source, proven array query receivers and arguments are saved in
source temporaries after the selected compiler's eager expression staging.
This preserves receiver evaluation before ordinary needle and index calls,
including a receiver changed by an argument. Conditional argument staging
still occurs before deferred receiver reads. Ordinary authored Code and other
source translators do not use this Arcade import pass.

## Qualification

Focused tests cover String, Number and Image arrays, mismatched needles, strict
image identity, shared array aliases, removal, shared image mutation and
once-only receiver/needle/index effects. They exercise native execution, Code,
same and fresh saved projects, actual selected-SDK exported execution and
reimport. A separate source oracle checks mutable receiver capture and eager
conditional ordering.

The heterogeneous source fixture itself is not selected-SDK source-valid. Its
valid oracle uses explicit erased needle views; export supplies those views
for the BrickWright authoring contract. This does not admit arbitrary source
typing or widen collection declarations to `any[]`.

Selected-SDK `indexOf` does not find NaN. The separately named Arrays `contains`
operation retains its existing behavior; this change does not add an SDK
`includes` method. Whole-project GUI, cadence and game qualification are
separate acceptance gates.
