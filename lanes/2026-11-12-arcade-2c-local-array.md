# Arcade 2c: native local literal-array positional evidence

Owner: Arcade delivery maintainer. Status: IMPLEMENTED candidate; application qualification and landing pending.

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
all Array element domains. Three admitted slot cases and fifteen near misses
pass; six source cuts are detected. The pre-change source fails the precision
control. Calls returning primitive values remain outside this proof. This does
not complete the PXT staging fixture or authorize broader local Array effects.
