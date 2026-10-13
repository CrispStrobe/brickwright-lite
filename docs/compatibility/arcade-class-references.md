# Arcade class references

The native Arcade route supports explicit public class fields, constructors and
ordinary methods. Instances have runtime-owned reference identity: assignment,
arguments, returned values, self references and arrays retain aliases. Field
writes mutate the same instance; metadata JSON describes declarations and never
stores the mutable heap. Imported class equality uses typed value comparison.
Ordinary Scratch comparison retains its existing casting rules.

Code and Blocks expose six operations: declare a class or subclass, construct an object,
read a field, write a field and call a method. Declaration ports contain fixed
field, parameter and method metadata and managed procedure names. Connected
object, array, Sprite and Image values remain typed references. Saved SB3 files
retain declarations and instructions; running or reopening reconstructs the
heap. Restoring a live heap snapshot or editing it in an object inspector is not
qualified. Stale or foreign references and unknown members report errors.

Constructor arguments execute once, left to right, before field initializers
and the constructor body. Parameter properties and readonly initialization are
retained. Omitted optional arguments use undefined unless a declared literal default
is supplied for that missing slot. Explicit undefined does not select a default,
matching the selected SDK; null, false and zero remain supplied values. Selected SDK controls observe undefined for
uninitialized number, Boolean, string and object fields. Managed void calls use
an inert return sentinel so completing a constructor cannot re-enter its body.
Explicit waits yield; Stop, restart and project replacement cancel old calls.

The retained MIT TeamData source qualifies public readonly parameter properties,
namespace type references and whenUsed allocation reachability through original
execution, Code, export, reimport and fresh SB3. This does not admit the entire
football extension or qualify a complete game.

Accessors, static members, captured callbacks, runtime constructor aliases and
ordinary class instanceof remain explicitly unsupported. The
selected SDK rejects this in field initializers and effectful parameter defaults;
these source forms have diagnostics. Readonly and public/private/protected
visibility are static TypeScript metadata, retained on export. Invalid typed
accesses remain diagnosed; valid any receiver accesses use the same live fields
and methods without runtime visibility or immutability restrictions. Construction
tokens govern allocation completion and cancellation, not field mutability. The
selected SDK rejects unary updates on any class properties; source diagnostics
retain that boundary while valid assignment and compound assignment are supported. General exception
flow, garbage collection and arbitrary JavaScript objects are not qualified.


## Ordinary inheritance

A fixed parent declaration and `super` calls support ordinary source classes.
The additive subclass declaration retains the existing class block and saved
projects. Runtime descriptors resolve parents lazily without allocating unused
objects. Inherited fields retain declaring ownership; overridden calls dispatch
on the live instance. `super.method` selects the ancestor implementation while
calls through `this` can dispatch to a child override. Private, protected and
readonly checks retain their static declaring and receiver scopes; valid any
casts still operate on the same mutable heap.

Initialization follows the selected PXT compiler profile, which differs from
JavaScript derived-class execution. Arguments run first, then flattened ancestor
and child field initialization, followed by each explicit super argument,
ancestor field initialization and constructor body. Three-level controls observe
`ABCABAabc`; the two-level argument/field/super/virtual control observes
`xfgsfbVPcVP`. Export retains initializer expressions and explicit super placement
so original execution repeats the same effects. Implicit constructors forward
arguments without an invented body. Number, Boolean and null defaults bind missing constructor, method and super
argument slots; explicit undefined remains distinct. Authored undefined checks
and later parameter-property assignments remain executable export bodies.
Changed generated initializer, parameter-property and super helper bodies are
refused explicitly when their declaration metadata no longer represents them.

The selected SDK requires parent declarations before children, explicit
constructors for initialized fields, and super first when a derived constructor
has initialized fields or parameter properties. Invalid placement, duplicate
inherited fields and inaccessible or reduced-visibility overrides are diagnosed.
SDK intrinsic Sprite/renderable/dialog bases, generic bases and callback-dependent
inheritance require separate asset, runtime and callable qualification. Ordinary
inheritance does not admit those extension packages or complete games.
