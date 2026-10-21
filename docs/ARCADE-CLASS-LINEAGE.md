# Closed local class lineage

The private primitive-result analysis follows actual, lexically bound local
parents declared before their children. It combines inherited field writers,
separate getter and setter halves, and concrete receiver dispatch through base
constructors and methods. An ancestor constructor can invoke a child override
before child fields are initialized; those earlier Undefined values remain in
the result domain. Every inherited method remains in the writer census even
when no call to it is observed. Missing constructor arguments and defaults use
the actual source, rather than annotations.
The selected structural default profile currently admits Number, Boolean, Null
and signed numeric literals. String and nonliteral defaults remain unsupported
in this path; extending that profile needs separate source admission and does
not follow from possible original MakeCode support. This is not blanket
MakeCode parity.

The original getter read or complete method call remains once in the private
model. This analysis neither changes source execution nor grants Array body,
Number input or runtime ownership authority. Unknown effects, constructor
escapes, opaque writers, changed source, cyclic/replaced/unresolved parents and
unsupported structural conflicts retain refusal. Selected source rules resolve
accessor halves independently and reject super accessor reads/writes.

## Qualification and remaining work

The complete eight affected pure source modules pass all 27 controls with no
skips. The first run preserved a missing sparse fixture failure (26 pass, one
ENOENT); adding the exact tracked fixture allowed the complete group to pass.
Product source and assertions were unchanged between those two runs. This
qualifies source analysis only, not native execution, original-SDK compatibility
or browser authoring.
The focused controls cover multi-level inheritance, actual super arguments,
constructor defaults and missing arguments, opposite accessor halves, virtual
dispatch before field initialization, inherited uncalled writers, escapes,
parent replacement, structural conflicts and source currentness. Two former
local-inheritance negatives become explicit positives, each paired with an
unresolved-parent negative. Original failures remain part of the evidence.

SDK Sprite ancestry, selected SDK slot descriptors, Image ingress and
allOfKind receiver sets are separate work. No SDK name or annotation is an
authority grant here. The historical corpus partial count is unchanged.

GUI acceptance remains pending: represent inherited members and super in
Blocks and pseudocode, retain diagnostics for unsupported paths, and distinguish
property authoring from actual child overrides. Verify Code → Blocks → Code,
original export/reimport and fresh SB3 reopening with exact values and effect
traces, including constructor virtual dispatch before child initialization.
Source-only results do not qualify those visible editing or application routes.
