# Arcade classes and mutable objects

Status: lane claim merged. The initial reference heap, constructors and methods
are implemented with original/native and authoring controls. Read the
[qualified scope](compatibility/arcade-class-references.md) and
[GUI ledger](CONVERSION-CAPABILITIES-AND-GUI-GAPS.md) for current support.
Ordinary inheritance and virtual/super dispatch have focused controls. Accessors,
statics, instanceof, captured callables and installed editor closure remain
separate steps; this contract does not claim full class compatibility.

## Ordinary constructor parameter properties

The source candidate for stored class callbacks accepts ordinary constructor
parameter properties only when the parser's hidden parameter metadata and
constructor metadata share the same array, the field declarations agree on
type and visibility, and the actual constructor body starts with the matching
ordered assignments. The existing producer proof still checks every argument,
field write, callback invocation and constructor completion. An annotation does
not initialize a field. Readonly writes and private or protected access retain
their existing restrictions.

Callable constructor parameters use the existing explicit callable signature
metadata, obtained from the completed argument and constructor-body proof.
Export compares that signature with the actual constructor procedure and
lexical owner before rendering its type. Raw function-type text does not
replace this signature or supply current-body authority.

Lowering preserves the hidden descriptors and shared metadata references. A
completed proof that observes changed metadata expires permanently; restoring
the old values requires a fresh proof. Defaults, optional parameters,
inheritance and native Sprite or scene callback domains are outside this new
correspondence rule.

Focused controls cover ordinary Number and Void callbacks and the current
Code, Blocks, SB3 and source export/reimport routes. Their execution and
affected native guest qualification remain pending for this candidate. This
does not establish compatibility with a complete retained library. Existing
raw class and callable authoring vocabulary is reused; no dedicated constructor
parameter-property editor or installed GUI qualification is claimed.

### Unused ordinary Void calls during current export

An actual owned class or callback call returning Void may remain an expression
statement when lowering stores its unused result in a local sink. Export must
prove the exact current receiver and arguments and the sink's physical owner.
The sink must have no value binding, formal, capture, reader or other writer in
the current project; its spelling supplies no authority. The call remains once
in its original position, with its effects and possible exceptions preserved.
Currentness failure expires this statement proof even if edited data is restored.
The partial lexical typer need not assign a value type to an ordinary global
receiver: the statement proof uses the existing current class producer and
all-writer checks. A known conflicting result still refuses. All actual local
initializations and complete bodies remain subject to lexical validation; no
receiver value type is added to the partial typer by discarding the result.
At the source module root, the same sink proof can retain a zero-argument call
to an actual current module-level declaration with a Void signature and matching
physical definition and formals. Its complete body must still validate. This
admits a statement, not a general function-call value producer; parameterized
declaration calls and unknown targets are outside this narrow root route.

Current ordinary-class staging locals are emitted as bare typed declarations,
followed by their actual ordered allocation and alias writes. Emitting an
explicit Undefined initializer would invent an incompatible class producer.
Bare declarations supply no instance: a read before the actual assignment or a
wrong assigned value still refuses, and an authored explicit Undefined
initializer remains distinct and unsupported by this class producer proof.
Primitive, callable and SDK local declaration routes are unchanged.
Direct visual Blocks editing of constructor parameter-property modifiers and
signatures, and of ordinary-class typed local declarations, remains unqualified.
Code and Creator conversions do not establish that editor acceptance.

This does not admit Void as a stored value or arbitrary unknown calls. Existing
conditional and field-mutation proofs remain separate. Code, current blocks and
saved-project export controls cover this narrow representation; dedicated GUI
authoring, affected native execution and complete-game qualification remain
separate acceptance requirements.

## Why a separate reference model is needed

Before this lane, Arcade refused ordinary source classes. The shared translator has a
bounded record lowering used by other targets: per-class numeric slots index
field arrays. Same-class aliases can share those arrays, but this does not
establish globally unique object identity or runtime class dispatch.

A focused original-runtime counterexample exposes constructor ordering: the
original evaluates call arguments, then instance field initializers, then the
constructor body. Existing record lowering emitted field initialization before
argument evaluation. Preserve the failure and repair semantics before admitting
classes through that lowering. Syntax support or a successful compilation does
not establish runtime fidelity.

## Required model

- Mutable references have unique identity within the current run, independent
  of class or allocation site. Assignments, array membership, fields, arguments
  and returned values preserve aliases. Null and undefined remain distinct.
- Class descriptors retain declaration identity, parent relationships and field
  and method definitions. Reject unsupported constructs explicitly rather than
  substituting a JSON snapshot, scalar copies or an untyped array value.
- Constructor argument evaluation, field initialization, parameter properties,
  base construction and constructor body execution retain original order,
  single evaluation and side effects. Suspension uses the actual caller/run.
- Field reads and writes, method receiver binding, getters/setters, statics,
  inheritance, virtual dispatch, equality and `instanceof` have separately
  qualified behavior. Boundaries must remain explicit until each is supported.
- Function and callback values preserve receiver/capture ownership across
  asynchronous calls, nested constructors, stop, restart and project replacement.
  Reference values from an earlier run cannot acquire a new run's authority.
- Use the existing value/array facilities when their semantics are appropriate;
  extending the Arrays extension is permitted. Representation must carry object
  identity, type and lifetime explicitly rather than rely on coincident indices.

## Authoring and export

Implement actual Code and Blocks forms for class definitions, instance creation,
field access and method calls. Definitions and source-visible names survive
saved SB3 projects, Code decompilation, reopening, MakeCode export and reimport.
A runtime-only helper or opaque source comment is insufficient. Track completion,
block palettes, debugger inspection and reference display in the GUI ledger.
Graphics and native library subclasses require their own asset and lifecycle
controls; admitting a class cannot automatically admit an extension package.

## Ordered acceptance

1. Bind unchanged original programs and SDK/compiler identities. Preserve
   constructor-order and alias/identity counterexamples.
2. Qualify mutable records and constructors: primitive/reference fields,
   same-class aliases, cross-class identity, array-held instances, nested
   construction, argument and initializer side effects, and null/undefined.
3. Qualify methods and activation ownership: recursion, receiver binding,
   returned instances and suspension/cancellation.
4. Add statics, accessors, inheritance, virtual dispatch and `instanceof` with
   original controls for each. Unknown features remain diagnosed by name.
5. Repeat the controls through editable Code, Blocks and a fresh saved-project
   reload, then actual original export execution and reimport.
6. Run unchanged complete games using these features through the matching
   production GUI and controller pane. Qualify assets, lifecycle and observable
   success before changing corpus classifications.

Full original package execution, historical target selection and source-license
admission remain independent requirements. Do not label selected-SDK compiler
failures as historical invalidity or structural admission as full compatibility.
