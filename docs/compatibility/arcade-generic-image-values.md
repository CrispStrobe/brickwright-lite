# Image values in partial Arcade conversions

Static image resource planning is shared by the ordinary fallback and native
Arcade conversion routes. A retained unsupported class or helper does not turn
an independently readable image initializer into a text placeholder. Unsupported
neighboring code and its diagnostics remain; this does not make a partial app
fully supported.

The fallback allocates resources only while emitting actual Image expressions.
Source inspection and `imageOf`/`imageRef` probes do not allocate. Diagnostic-only
class bodies, unsupported statements and their un-emitted literals cannot leave
orphan artwork that current export would interpret as actors. Generated resource
names reserve actual source identifiers and previously allocated resource names.

The fallback claims actual unshadowed `img` literals with readable indexed
pixels. Each source expression owns a hidden artwork template and evaluates the
existing Image copy reporter at its original execution position. A declaration
therefore allocates once when evaluated; ordinary aliases read that same value.
Evaluating a function's literal again creates a fresh Image. Distinct expressions
remain distinct even if their pixels match. Template sprites are hidden resource
carriers and are not added to the fallback's live actor planning inventory.

The native route retains its existing frame-array, background, built-in artwork
and direct sprite-art policies through the shared planner. The fallback does not
acquire Image authority from namespace identifier spelling or variable names.
It conservatively refuses literal ownership if a configured declaration, class,
enum, namespace, loop variable or formal parameter binds
`img`, or a configured assignment/update replaces the tag, including ambient
global tag writes and writers in retained neighboring helpers. Unknown executable
AST nodes refuse the configured writer census. Any configured ambient handle
(`globalThis`, `window` or `self`), escaped `img` value, dynamic `eval`/`Function`
access, reflection handle or constructor-based dynamic code access also refuses
this domain, including uses in unused helpers. This deliberately leaves safe
programs unadmitted; it does not interpret arbitrary JavaScript effects or prove
all host-object aliasing. Unknown `this` ownership is conservatively refused,
including class uses that have not been proved for this source domain. Computed
access is admitted only when the existing actual-value graph proves initialized
Array allocations, compatible all writers without escape, and an initialized
actual Number index. An Array annotation, a string key or a computed constructor
spelling supplies none of that proof. Other computed access remains unadmitted;
there is no constructor-name constant folding or dynamic effect interpreter.
Existing unsupported call/body diagnostics remain.
Unreadable pixels retain the named diagnostic. More precise lexical admission
can later accept additional programs without making unknown tags authoritative.

## Qualification

The focused source controls are authored for unsupported class retention,
unused helper preservation, exact pixels, separate equal-pixel declarations,
alias mutation order, repeated function evaluation, hidden templates, shadowed
tags and unreadable art, resource/actor naming collisions and a synthetic current
resource-inventory export check for non-emitted class artwork. They require an
explicit bounded execution review;
this document does not claim they have passed.

Native pixel/alias observations, current Blocks edits, project persistence,
current artwork export and actual MakeCode execution are separate gates.
Existing unsupported diagnostics must accompany the conversion result; source
resource recovery does not qualify an entire app or justify suppressing any
remaining failure. The Image domain and literal-resource ownership remain those
of [owned Image class callbacks](arcade-owned-image-class-callables.md).
