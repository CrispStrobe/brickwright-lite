# Arcade class references

The native Arcade route supports explicit public class fields, constructors and
ordinary methods. Instances have runtime-owned reference identity: assignment,
arguments, returned values, self references and arrays retain aliases. Field
writes mutate the same instance; metadata JSON describes declarations and never
stores the mutable heap. Imported class equality uses typed value comparison.
Ordinary Scratch comparison retains its existing casting rules.

Code and Blocks expose five operations: declare a class, construct an object,
read a field, write a field and call a method. Declaration ports contain fixed
field, parameter and method metadata and managed procedure names. Connected
object, array, Sprite and Image values remain typed references. Saved SB3 files
retain declarations and instructions; running or reopening reconstructs the
heap. Restoring a live heap snapshot or editing it in an object inspector is not
qualified. Stale or foreign references and unknown members report errors.

Constructor arguments execute once, left to right, before field initializers
and the constructor body. Parameter properties and readonly initialization are
retained. Omitted optional arguments use undefined; supported literal defaults
execute in the procedure. Selected SDK controls observe undefined for
uninitialized number, Boolean, string and object fields. Managed void calls use
an inert return sentinel so completing a constructor cannot re-enter its body.
Explicit waits yield; Stop, restart and project replacement cancel old calls.

The retained MIT TeamData source qualifies public readonly parameter properties,
namespace type references and whenUsed allocation reachability through original
execution, Code, export, reimport and fresh SB3. This does not admit the entire
football extension or qualify a complete game.

Inheritance, accessors, static members, captured
callbacks and runtime constructor aliases remain explicitly unsupported. The
selected SDK rejects this in field initializers and effectful parameter defaults;
these source forms have diagnostics. Readonly and public/private/protected
visibility are static TypeScript metadata, retained on export. Invalid typed
accesses remain diagnosed; valid any receiver accesses use the same live fields
and methods without runtime visibility or immutability restrictions. Construction
tokens govern allocation completion and cancellation, not field mutability. The
selected SDK rejects unary updates on any class properties; source diagnostics
retain that boundary while valid assignment and compound assignment are supported. General exception
flow, garbage collection and arbitrary JavaScript objects are not qualified.
