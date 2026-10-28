# Arcade instance accessor scope

Status: bounded instance getter/setter implementation qualified against the
selected original SDK and native managed class runtime. Existing property
Code/Blocks words retain descriptor ownership and actual accessor bodies.
This does not qualify complete extension packages or a class designer in the GUI.

## Actual source demand

The retained MIT statusbar 0.4.1 source declares sixteen accessor halves:
`StatusBarSprite.value` and `max`, plus `StatusBar.barWidth`, `barHeight`, `label`,
`max`, `current` and `image`. These accessors invoke real methods, mutate backing
fields, rebuild images or deliberately ignore a write. They cannot be replaced
with plain field slots. Spriteutils 0.3.1 has no accessors; its callable handler
fields and scene update ownership remain separate work.

Five retained contexts include both exact package bodies. Ordinary accessor
support does not clear their remaining callable, Font, graphics, event, asset
and scene contracts. Keep the full package source and its notices.

## Selected original behavior

Arcade 4.2.1 / PXT 13.2.1 controls establish these boundaries:

| Control | Observed behavior |
| --- | --- |
| Read, write and aliased read | Getter/setter trace `gsg`, values 2 then 5, same object. |
| Compound assignment | Receiver, getter, RHS, setter trace `rgvs`; receiver runs once. |
| Prefix/postfix update | Trace `gsgs`, old value 2, new value 4, backing value 4. |
| Recursive setter with explicit waits | Trace `sssg`, final getter value 1. |
| Child getter with inherited setter through Base | Trace `csc`, values 12 then 15. |
| Child setter with inherited getter through Base or any | Trace `gcg`, values 2 then 15. |
| Paired accessors through any | Real setter/getters run: `sgg`, typed and dynamic reads both 5. |
| Direct Child access to its setter-only declaration | Compiler requires a corresponding getter, despite a Base getter. |
| Setter-only class property access | Compiler requires a corresponding getter. |
| Inherited accessor/field versus ordinary method | Compiler rejects the conflicting member slot in both directions; heap and export also refuse it. |
| Getter-only typed write | Compiler rejects the readonly property. |
| Getter-only any write | Actual simulator faults; this is not a mutable field write. |
| Setter default or optional parameter | Compiler rejects it. |
| Super accessor read or write | Compiler permits only accessible base methods through super. |
| Constructor virtual getter | Trace `BcCc`; initialized fields and parameter properties produce 9 during Base construction. |
| Image, Sprite, object and array aliases | Exact reference identity; image pixel mutation and replacement preserve old/new image aliases. |
| Empty setter; string and Boolean setters | Ignored numeric write retains 2; string becomes `b`, Boolean becomes true. |
| Explicit any numeric setter receiving false | Runtime value remains false; export retains a necessary dynamic receiver cast. The tested typed literal mismatch remains diagnosed. |
| SDK Sprite subclass accessor | Setter changes the actual canonical Sprite position to 23; `allOfKind` returns the same instance. |
| Uninitialized backing field | Getter returns undefined before a setter writes 7. |
| Receiver/parameter/property spelling collision | Authored `__bwSelf` bindings, quoted strings and property names remain distinct from the generated receiver. |

Static receiver declarations and runtime virtual dispatch must therefore remain
distinct. Getter-only Child declarations also retain their own readonly source
boundary while an inherited setter remains available through a qualified Base
receiver. Defaults for ordinary constructors and methods retain their existing
missing-slot rules; setters do not acquire optional or default arguments.

## Implementation unit

- Preserve accessor kind, modifiers, parameter and result types in the parser.
  Diagnose invalid arity, defaults, duplicate halves, field/method conflicts,
  incompatible override types and unsupported static accessors.
- Add fixed getter/setter procedure descriptors to class property metadata.
  Existing fields and method descriptors remain readable. Property declarations
  contain no mutable snapshots and do not allocate a second backing field.
- Resolve getter and setter implementations independently through the live
  class lineage. Retain declaring ownership for static access checks and match
  the selected original's partial-override receiver restrictions.
- Route property reads and writes through the existing managed procedure
  executor with the same self reference, caller, construction token and run
  lifetime. Reuse existing object-field Code/Blocks words. A getter reporter or
  setter command must suspend, recurse and cancel just like a managed method.
- Preserve single receiver evaluation and getter/RHS/setter order. Coordinate
  selected-PXT staged expression prefixes before rewriting property operations;
  conditional argument staging must not silently move an accessor call.
- Export actual accessor bodies and source-visible declarations. Validate
  descriptor/procedure arity and ownership, retain authored edits, and insert a
  qualified receiver cast when the selected compiler requires Base access.
  Getter-only writes and unsupported super accessors keep named diagnostics.

Owned product paths are the class portion of `ts-import.js`,
`lower-object-classes.js`, `object-class-export.js`, the Arcade `object-heap.js`
and class operation hooks in `index.js`, plus focused accessor controls and
scope documentation. A converter emission change is allowed only if an actual
ordering control requires it. The shared staging prepass, primitive Boolean
export inference, Arrays profiles and global scheduler belong to other owners.

## Qualified controls and remaining boundaries

`test/makecode-arcade-class-accessors.test.mjs` runs nineteen positive cases
through native execution, editable Code/Blocks, original SDK source export,
reimport and fresh VM saved SB3 execution. Separate same-VM replacement,
Stop/restart, malformed metadata, missing halves, visibility, defaults and
invalid return controls retain explicit boundaries. Edited receiver/parameter
names must retain unique identifier and global binding ownership. Getter-only custom accessor
writes through any remain refused rather than becoming mutable field writes.

The affected ordinary inheritance, visibility, object heap, SDK Sprite and dialog
regression gate passed 66 controls. After the receiver hygiene correction, 30
final affected controls passed, including every accessor case and concrete shared
class/SDK authoring regressions. Three additional ownership controls passed for
prototype names, and two final controls retain original compiler refusals plus
lazy heap/export refusals for inherited member slot conflicts. Five mutations were detected: getter bypass,
setter bypass, inherited setter loss, generated receiver collision and quoted
identifier replacement. Frozen inputs and original failures are retained.

This implementation has no dependency on the experimental selected-PXT staging
prepass or scalar declaration profile. Conditional argument/field staging and
primitive declaration flow remain separately qualified work; their prefixes
must be preserved when integrated. Constructor/method defaults retain the
existing missing-slot rules. Unsupported static accessors, callable fields,
opaque Font operations and source `super` accessor calls remain diagnosed.

No production GUI, debugger property inspection, statusbar graphics, complete
package or whole-game completion claim follows from these controls. Hosted
exact-head checks and reviewed integration remain required before landing.
