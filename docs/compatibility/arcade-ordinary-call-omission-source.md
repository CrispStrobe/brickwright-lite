# Ordinary optional argument source transport

The first source implementation follows the
[ordinary call omission contract](../ARCADE-ORDINARY-CALL-OMISSION.md).
It resolves actual call/declaration/formal identities before class and callback
lowering, checks an unescaped unchanged ordinary callee, and supplies actual
Undefined operands only for that call's absent optional suffix. Provided values
and helper bodies remain. No-default admission excludes generic, rest, nested,
captured and existing default-bearing protocols.

The Arcade serializer writes actual Undefined canonically even on its generic
fallback route. A retained unsupported neighbor must not turn this value into
zero. The planner adds no reference producer domain or declared-type value facts.
Full provided calls and unknown reference consumers remain independently checked.
Existing signature-default omission bits and initialization remain unchanged.

Eight focused source controls are authored, not yet executed. They cover exact
call/formal identity, missing and provided Undefined, mixed unknown provided
references, unused helpers, escaped/replaced/duplicate declarations, defaults,
missing required/excess arguments, nested/generic exclusions and the public
generic translation route. Source controls alone establish no native behavior.

Current optional signature catalogue/Blocks controls, edited call validation,
current export and save/reopen remain pending. Unknown reference signature or
provided-value export must remain a named refusal; source normalization cannot
supply that authority. A fresh affected app route must retain every diagnostic
and partial output. Parsing or arity recovery is not whole-app qualification.
