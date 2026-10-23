# Class lexical declaration readiness

## Implemented source behavior

This change composes existing captured class primitive results with three actual
parser/analysis shapes. It supplies no initialized receiver, value producer,
Array allocation or method-entry certificate.

- A parser If with an own data `alternate:null` has an implicit empty else. Its
  false path contributes the incoming frontier; the normal then path is joined
  with it. A real two-arm If retains intersections and abrupt completion rules.
  Missing, inherited, undefined, accessor and malformed alternatives are refused.
  Statements and callable bodies must have dense own data elements.
- An Identifier `this` is admitted only while validating an actual nonstatic
  Class-owned constructor, method, getter or setter. Context is private, not an
  AST flag. Ordinary nested functions and global/static/field contexts acquire no
  permission. All field initializers mask an outer method's context, including
  fields of a Class nested inside a method. Inner methods need their own role.
- Private class Boolean carriers use actual Boolean false, matching the parser.
  Their original getter/call test, primitive domains, exact issued membership and
  currentness remain separate from receiver declaration readiness.

`ts-import.js` now retains an own Boolean `isStatic` on constructor records.
A static constructor-named method receives an explicit unsupported diagnostic
in this parser slice. Missing constructor role information cannot mean instance.
No other parser grammar or language profile changes here.

The declaration analysis reads own data for callable bodies, parameters, defaults
and class-role slots before traversing them. It does not invoke an inherited
getter to recover a missing role. Observed source edits or reflection failures
expire the declaration snapshot. An analysis-time exception preserves its first
error and expires the proof as well.

## Obligations that remain unchanged

Method and constructor records still begin with empty declaration frontiers.
This slice does not enumerate method calls or propagate constructor/callback
entry states. A constructor calling a captured read before the receiver's
outer declaration completes still blocks that read, even when a later call is
safe. Early virtual calls, unknown entries, aliases, escapes, default inputs,
all writers and original getter/method effects retain their independent checks.
The generic graph can still report the captured receiver uninitialized while
its actual declaration is known to have executed.

Global `this`, this-based heritage and template tags stay reflective refusals.
Static members, field-initializer receivers and nested ordinary/arrow receiver
captures remain separately scoped. A method record with a forged name/kind or
moved function tag cannot acquire instance ownership. Legacy records lacking a
constructor role may retain their old no-this traversal, but gain no new role.

This is source implementation pending focused and hosted qualification. It is
not a claim of full class, runtime, editor or application compatibility.

## Qualification

The complete new `test/native-class-lexical-frontier.test.mjs` covers actual
parser shapes, flow joins, own data/malformed inputs, receiver ownership and
constructor reentry. The preceding captured-class module keeps its complete
EOF program, input-uninitialized assertions and surrounding negative controls.
Its known raw-nullIf and two legitimate this-getter/method boundary cases migrate
to positive readiness/admission; no opaque, Array, TDZ or foreign-effect refusal
is removed. Retain the original diagnostic failures as separate evidence.

Run complete new/affected pure modules under fresh resource admission, then all
enabled checks on the final hosted head, including original class/function-return,
Math.idiv and SDK controls. Source tests do not replace actual browser/export/
reimport checks. Remeasure complete applications before changing corpus counts.

## Remaining tasks for the next owner

1. **Visible authoring:** check which constructor/property/getter/setter/method
   operations the current Blocks and pseudocode editors can express. Scope any
   missing controls explicitly; accepting imported source does not create these
   editor features. Use readable class/member names and real parameters rather
   than internal helper names. Preserve the class metadata through save/reopen,
   blocks-to-code and MakeCode export/reimport. Test constructor edits, setters,
   Boolean/primitive unions and real captured callbacks against runtime values.
2. **Method entry propagation:** a future producer must enumerate actual closed
   constructor, getter, setter and method entries, including receiver identity,
   inheritance/virtual dispatch and every argument/effect. No source tag or known
   method name supplies this. Keep empty seeds until that complete inventory is
   proven; pair every new positive with constructor-reentry and bad-second-entry
   controls. This task needs its own merged scope before graph/API changes.
3. **Nested receiver capture and fields:** distinguish genuinely lexical arrows
   from ordinary/dynamic functions using retained source information, and model
   field execution at actual allocations in the proper constructor order. Prove
   captures independently; do not inherit a surrounding method's permission.
4. **Property-name grammar:** independently scope keyword-named accessors. The
   current parser's identifier-only lookahead can misclassify `get static()` or
   `set class(v)` as other members. Preserve modifier/method ambiguities and
   explicit diagnostics while adding genuine property-name recognition. This
   known grammar issue is not changed or credited by this slice.
5. **Graphics and references:** Image/Sprite/reference fields need their own
   origin, heap and editor capabilities. Primitive result authority is not
   reference storage or an artwork identity certificate.

Ownership is specified in
[`lanes/2026-10-23-arcade-class-lexical-frontier.md`](../lanes/2026-10-23-arcade-class-lexical-frontier.md).
See also [captured class primitive results](ARCADE-CAPTURED-CLASS-PRIMITIVE-RESULTS.md)
and [the GUI capability ledger](CONVERSION-CAPABILITIES-AND-GUI-GAPS.md).
