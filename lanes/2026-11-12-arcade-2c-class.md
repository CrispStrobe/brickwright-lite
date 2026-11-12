# Arcade row 2c, part 1: class formal refusal controls

Status: claim and change in one PR. Owner: Arcade lane. Base: main `266c320d`.

Row 2c was planned as separate PRs, each merged before the next starts:
1. this part: class constructor/method formals;
2. never-reassigned Boolean literal globals for `&&`/`||` results;
3. procedure results proven Number from every return;
4. array-literal elements for constant in-bounds index reads;
5. class field reads proven from constructor writes;
then the type-safe `pxt-staging` fixture rewrite and the 2c row marked done.

Scope: one new test, `test/makecode-arcade-class-member-constraints.test.mjs`,
and its GUI-scope entry. No product source changes.

What the test pins, through the real import, Code and export route:
- `new Box(<any>"x")` into `constructor(public n:number)` is refused
  (`Class primitive export: argument Box... .n conflicts with declared number
  (actual String)`).
- An `<any>` Boolean into a Number formal is refused: class constructor and
  method formals on export, and the ordinary `pair.b` formal at import
  (`Procedure parameter constraint: pair.b requires Number from actual producers`).
- An `<any>` Text into a Number method formal is refused.
- A positive control with Number arguments exports with no diagnostics.
- Nonvacuity: turning off the class export `requireType` check fails 3 of the
  4 tests. Turning off the ordinary call-site `requireTypes` fails the Boolean
  test.

Why import-time class obligations were not added: a version that applied the
ordinary protocol to class constructor, method and setter formals at import
refused admitted controls in `makecode-arcade-class-primitive-export`,
`makecode-arcade-class-primitive-valid-flow`, `makecode-arcade-class-accessors`
and `arcade-class-array-writer-types`. Examples: `(box as any).value=false`
through a setter, explicit `undefined` arguments, default formals, and
setter arguments that come from formals the import graph does not feed. The
class export protocol already refuses real contradictions. Making the import
stricter would change those controls, so that part stopped.

Accessor row (`makecode-arcade-accessor-pxt-staging`): stays TODO. With class
member producers the source imports, but native inspection then refuses with
"connected input lacks complete primitive domain evidence". The native domain
proof has no rule for object field reads or accessor dispatch
(`arcade object (...) field ("value")` into `pair.a`). A sound rule must cover
every field writer, setter dispatch through field assignment, and the field
before the constructor writes it. The `pxt-staging` row's `new Box(..).value`
argument needs the same native rule, so parts 2 to 5 cannot make that row
admit until it exists.
