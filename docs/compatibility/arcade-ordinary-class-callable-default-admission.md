# Bounded ordinary class callback default admission

## Current bounded implementation

Reviewed candidate `1f4853394742fdf8b9e0d329ac78b5be4253ff4c` is normally
integrated at `709a5432e23104dd5332dd40c72e95ae79181198`. Complete parsed-source
producer flow, current-project validation and a second reconstructed-source gate
now admit the bounded ordinary Number/String State/Holder callback profile by
default. The existing version 1 numeric whole-program gate remains independent.

Independent review passed 36 affected checks and 12 refusal cases, including
bad disconnected writers on the same and foreign targets. Two new actual
renamed/yielding originals, source and export, both returned `3 / ok / 3`; all
SDK guards and actual compilation inputs matched. Earlier unchanged originals
were reused only after exact input-byte comparison.

Inheritance, accessors, intrinsic Font/Sprite classes, Array producers, module
callable globals, recursive callbacks, optional/default parameters and generic
constraints/defaults remain outside this profile. These are named refusals.
Hosted editor qualification is pending. The contract below retains the remaining
acceptance criteria; these bounded results do not complete every criterion.

## Source ownership gate

A new pure gate must read the complete parsed program and actual lexical binding
and directed producer/writer flow before choosing the class callable pipeline.
It returns an eligible profile only after every declaration, executable body,
callback creation, invocation and adjacent statement has a supported rule.
Unknown neighboring code yields a named refusal; it is never removed to make
one otherwise eligible class pass. The ordinary and numeric import paths retain
their existing diagnostics and selection when this profile is absent.

The first profile covers ordinary, explicitly constructed typed classes with
straight-line constructors and methods; callable fields storing owned Arrows;
and a method with one unconstrained type parameter such as
`apply<T>(action: (state: State) => T): T`. Concrete invocations must independently
prove Number or String results and exact argument signatures. Every actual call
must have its complete argument mapping: missing, extra or optional arguments
cannot be filled from annotations. Non-void callback/method results require
proved returns on every admitted path; implicit fallthrough is genuine Undefined
and must never be fabricated as Number, String or a callable. Constructors and
proved void calls retain their actual undefined completion. Renamed classes,
methods, fields, parameters and locals have identical eligibility. No particular
class name, helper spelling, package or source annotation grants eligibility.

Actual allocation and alias producers anchor class references. Every reachable
and adjacent writer is checked against the same binding, including constructor
writes, later assignments and callback mutations. Declared signatures constrain
these producers; they cannot supply missing value provenance. A stored receiver
comes from the actual constructor/method lexical owner and retains its allocation
when another instance is created. A Number callback mutation must complete
before its caller proceeds. A pausing callback resumes through the existing
managed continuation; no Promise or synchronous wrapper substitutes for it.

The first scope excludes intrinsic ancestry (including Font, Sprite and Dialog),
class inheritance, accessors, generic constraints/defaults, generic constructors,
optional/defaulted parameters, dynamic method selection, recursive calls,
unknown control flow, module callable variables, Array signatures and opaque
argument/result producers. Uninitialized primitive-field callback results remain
unqualified. Callable field aliases require actual matching field signatures and
producer/writer proof; module callable aliases remain excluded. Ordinary object
aliases and copied receiver identity are distinct controls.

## Current Blocks and export gate

Default export must validate the actual current v2 plan, class registrations,
procedure definitions, parameter mapping, constructor signatures and current
connected editable bodies. Validate all non-plan class methods as well as
lexical callback owners. Inspect every writer and operation across the original
project targets, not only the method containing the query. Historical or foreign
writes cannot be ignored because current values happen to differ.

Proof-backed generated locals require the first dominating assignment in their
actual procedure. Reject forward reads, duplicated declarations, formal/capture
writes, type changes and collisions with visible source/global/class bindings.
Readonly writes require the actual constructor and its exact receiver; an Arrow
created inside that constructor does not inherit write permission. Private and
protected access uses the actual lexical owner. Discarded results preserve every
authored parameter/local and evaluate the original call exactly once.

Reconstruct the complete current program, then run the same source gate before
default export succeeds. Neither a valid inert plan nor a successful prototype
renderer can bypass that second check. Changed procedure bodies, statements,
argument chains, allocation anchors or ownership invalidate the current proof.
Stop, reload and scene replacement preserve existing lifetime rules. A fresh
start after a valid edit obtains a new proof; no cached argument object or stale
frame supplies authority.

## Proposed acceptance and adversaries

Required positives retain the actual State/Holder source and changed `+7` export
receipts, then add renamed instances, independent instances and reference aliases;
Number and String invocation-local specialization; mutation before continuation;
current Blocks edits; Code reparse; same and fresh SB3; pause, Stop and reload.
An admitted official GUI artifact must separately exercise visible callback/body
and signature edits, Code, fresh save, actual original export and reimport.
Existing supplier words and pins do not change in this lane.

Required refusals include:

- An otherwise valid pair beside an unrelated opaque callback, unsupported class
  method, nested function, generic constraint, foreign reference or unknown API.
- An annotated State producer returning Sprite, Font, Array or an opaque value;
  an alias cycle without allocation; a later foreign or incompatible writer.
- One shared generic procedure invoked with a wrong callback argument or result, missing actual arguments or a non-void body falling through Undefined;
  changed constructor callable signature; missing or duplicated parameter mapping.
- A callback formal overwritten with String, an unbound local read, a forward
  read, readonly assignment from a constructor-created Arrow, or private access
  from another lexical owner.
- A current block replacing an allocation/body/signature, a disconnected or cyclic
  argument chain, a foreign target procedure, or stale Stop/reload ownership.
- An authored formal/local colliding with any discarded-result prefix. This is a
  positive hygiene control requiring its value to survive, not a name refusal.
- A v1 numeric program adjacent to unproved class/callback code. The numeric gate
  must not become a fallback that silently authorizes the neighboring program.

### Concrete proposed mutations

Apply each mutation independently to the owned State/Holder control; retain the
unmodified control as the positive. The refusal must identify the actual gap.

| Source or current Blocks mutation | Required authority check |
| --- | --- |
| Change `holder.apply((s: State) => s.value)` to `holder.apply()` | Actual invocation arity is missing the callback, even though the method annotation still describes it. |
| Change an action to `(s: State): number => { s.value += 2; }` | The actual body falls through Undefined; do not use its declared Number result. |
| Add `function unrelated(value: any) { return value.missing(); }` beside the valid classes | Inspect the complete adjacent function rather than only the callback plan owners. |
| Change `apply`'s current first statement to `arcade_setLocal` targeting its actual `action` formal with a connected String VALUE | Refuse the incompatible writer; a later callable invocation cannot rely on the old formal annotation. |
| Replace the current State allocation input with a Sprite-producing reporter while retaining the original field/class metadata | Actual allocation and writer flow outrank the unchanged class annotation. |
| Add a method formal named `__bwDiscardObjectResult1`, mutate a field, then return that formal | Preserve its original value using a fresh discard cell; this source is valid and must not be refused for its spelling. |

Before implementation, merge this documentation claim with all enabled checks
and exact reviewed/landed tree verification. Product acceptance requires affected
pure/native controls and actual changed-source or changed-export originals only
when their executed bytes differ from retained authority. Do not replay unchanged
successful originals. Preserve first failures. No raw corpus denominator,
whole-game, StatusBar/Carnival or hosted GUI promotion follows from this contract.

## File ownership

The class owner may add standalone source and current-project gate helpers and
focused controls, with narrow selection hooks in `arcade-translate.js` and
`export-arcade.js`. Existing class descriptor, current-body provider and native
heap/frame services retain their strict authority. Coordinate shared frontend
and exporter hooks with the live Font owner; Font remains intrinsic and excluded.
The numeric gate and canonical vocabulary are independently owned and unchanged.
