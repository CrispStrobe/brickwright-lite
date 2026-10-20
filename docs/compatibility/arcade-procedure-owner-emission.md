# Ordinary procedure emission belongs to its actual owner

The existing [ordinary parameter-constraint lane](arcade-procedure-parameter-constraints.md)
requires unique actual procedure prototypes and ordered formals. This correction
owns only source-emission bookkeeping for those ordinary procedures.

The source translator visits called functions and their dependencies, then retains
uncalled helpers. Previously each traversal root created a new visited set. A
helper reached through another retained root could therefore emit a second
prototype for the same function on the same target. The retained Holiday context
exposed three `newGameOver` definitions for one source declaration and one target.

The candidate remembers actual function-record identity separately for each
actual owner object across all roots of one translation. The global inventory
still retains uncalled helpers. Dependency order, call sites and bodies remain
unchanged. Different owner objects and distinct declaration objects remain
separate even when their names or source text match. No runtime callable,
per-invocation captured allocation or source type authority is issued by this
bookkeeping.

Focused qualification must cover shared dependencies of called and uncalled
roots, diamond dependencies, cycles, distinct owners/declarations and independent
translation sessions. The authentic diagnostic context must retain its actual
remaining unsupported items, calls and warnings. No optional-reference/default
transport, SDK value widening, helper pruning, body replacement or argument
padding is included. Holiday's two omitted-optional-argument call failures and
its other source gaps remain independent. Native execution, original runtime,
editable authoring and whole-project promotion require their own evidence.

This is a source candidate until its focused controls and affected diagnostic
comparison have actually run. No broader compatibility result is implied.
