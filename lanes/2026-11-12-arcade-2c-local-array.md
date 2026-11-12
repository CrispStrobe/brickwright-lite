# Arcade 2c: native local literal-array positional evidence

Owner: Arcade delivery maintainer. Status: DONE in the implementation PR; clean guest qualification and landing remain required.

Own the local literal-array positional branch in console-inspect-values.js,
its mirrored package copy, and focused native controls. Admit only a uniquely
allocated empty local Array with a straight-line prefix of primitive literal
pushes before an in-bounds literal-index read. Reject uncertain scopes, writers,
captures, aliases, calls, mutations, branches, loops and out-of-bounds indices.
Preserve the existing global positional proof and all Number/Text refusals.
This is a bounded prerequisite; it does not complete the 2c source/runtime row.
Require actual-method positive/negative controls, nonvacuous cuts and affected
clean application qualification before source landing. No workflow, SDK/pin,
threshold, original intake or guest event change is owned.

The focused actual native query now selects one literal slot instead of merging
all Array element domains. Three admitted slot cases and twenty near misses
pass; seven source cuts are detected. The pre-change source fails the precision
control. Calls returning primitive values remain outside this proof. This does
not complete the PXT staging fixture or authorize broader local Array effects.

Endpoint expression inputs are closed too: sibling calls, aliases and extra
inputs cannot run before the read under the new positional proof.

The actual Creator push block includes an `INDEX` input even for `push`.
The positional proof admits that input only as a closed finite Number shadow;
missing, computed or effectful index inputs do not gain positional evidence.
Every pushed literal and sibling endpoint literal must also have a closed
primitive value. The importer's exact `0 + N` Number-literal wrapper is
admitted only with two closed numeric shadows and a zero left operand. A real Creator/native and original-PXT guest comparison is
included for qualification and remains pending until hosted checks pass.
