# Lexical declaration readiness — SOURCE candidate

Native addition may need to distinguish a declaration that has executed from a
value that the producer graph knows initialized. A bare lexical declaration can
leave an actual Undefined value. Readiness does not turn that value into zero,
change its type, infer an Array, or initialize the graph's binding.

The private source graph exposes a separate execution-frontier query. Only
actual owned Program/function/Block/conditional/loop statement slots and the
parser's supported expression slots are walked. Declaration-shaped metadata or
argument records cannot enroll bindings. A declaration is added after its
initializer, using lexical binding identity rather than name spelling. Branch
frontiers intersect and loops do not grant an outgoing iteration frontier.

An actual FunctionExpression body retains its allocation-time frontier. A
hoisted FunctionDeclaration instead needs a unique immutable declaration and
complete direct-callee reference census. Every actual entry must carry the
relevant executed binding; unknown, escaped, dormant or recursive entry does not
borrow a later valid call. A finite least fixed point composes closed forward
calls; nonconvergence refuses. Class method entries do not inherit a global or
closure frontier. String-evaluation/reflection roots and reflective member access refuse this
new theorem, including aliased eval/Function and unproved computed keys. A real graph-proved
Array receiver with exclusively Number index and no unsafe Array method
writers remains separate from reflective computed member access; this does
not issue any new Array or Number result fact. This
protects its closed-writer obligation; it is not a separate repair of older
initialized-operand paths. Defaulted callables and unsupported syntax conservatively
refuse this additional theorem; their effects and original bodies stay intact.

The native domain consumes this fact only after the original nonempty primitive
occurrence AND complete binding-writer tests. Unknown/Object/Image/Array writers,
parameter annotations, an empty writer set and exceptional noncompletion supply
no authority. Existing initialized-value and conservative inert-prefix proofs
remain separate. Full native Array allocation, escape, mutation and coercion
effect obligations are unchanged. Own-data physical source snapshots are captured before graph analysis, with
computation deferred until query. They sticky expire the new query after an
observed mutation, including before the first query; original full-source guards
continue to protect the native-domain result.

Complete new controls are
[test/native-array-captured-lexical-ready.test.mjs](../test/native-array-captured-lexical-ready.test.mjs)
and
[test/native-array-closed-call-entry.test.mjs](../test/native-array-closed-call-entry.test.mjs).
All existing captured-scalar, nested-helper, SDK-number, domain and helper
controls remain unchanged and mandatory as affected. SOURCE review and the complete eight-module, 23-test source-analysis group
pass with no skips. The original failures remain retained. No GUI/browser/SDK/runtime or
complete-corpus acceptance is established, and no broader refusal count is
attributed to this capability without actual evidence.

## Parser provenance and remaining qualification

String nodes contain unquoted token content, including retained escapes;
Boolean nodes contain actual booleans. Escaped computed String keys refuse
this additional theorem rather than bypassing reflection checks. Ordinary
parser default provenance can live in nonenumerable parameter-array metadata,
in declaration default names or in the retained optional signature. Every
nonempty or malformed supported carrier refuses this theorem. That refusal
survives the private view's parameter-array cloning. Default expressions and
the original prologue remain intact; these fields supply no positive authority.

The complete source group covers closure allocation, all hoisted entries,
primitive writers, TDZ, defaults, reflection, opaque effects, source mutation
and pre-query ABA. Clean original/emitted SDK, affected native/GUI gates and
integration checks remain pending. The separately observed animation export
failure on initialized `count = frames.length` is not attributed to this fix.
