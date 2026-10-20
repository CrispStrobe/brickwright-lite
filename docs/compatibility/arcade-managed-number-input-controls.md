# Current physical Number inputs at managed boundaries

## Proposal and observed boundary

This packet adds controls and a design, without production adapter changes.
The existing shared current-number-input utility is the sole interpreter.
A physical current `math_number` shadow carrying `20` means Number 20;
a physical `text` shadow carrying `20` means String `20`. Expected types,
annotations, numeric-looking strings and JSON contents establish no authority.

The retained pre-repair native matrix observed String `20` at ordinary/class
return, argument, local, field and captured-write boundaries. A factory argument
followed by `+=1` produced String `201`. The managed return adapter has since
been repaired separately. These observations do not prove a source compiler or
hardware defect.

## Minimal production ownership

| Consumer | Additional consumer authority | Interpretation point |
| --- | --- | --- |
| functionArgument | Actual current cached builder operation and existing argument-chain validation | VALUE before JSON packing; never after JSON parsing |
| setLocal | Existing real current frame/params map, strict local name and actual formal/local shared cell | VALUE before actual map write |
| setCaptured | Existing live capture token/map and current owner generation | VALUE before captured cell write |
| setObjectField | Existing live heap instance, real field/property and ordinary setter validation | VALUE before heap write |
| returnValue | Existing privately issued managed invocation, definition/prototype/body/frame lease | Existing repaired adapter, unchanged |

The adapter owner owns the shared helper, the four narrow native index call
sites, and their explicit synchronous engine marker allowlist entries. Each
adapter retains existing validation/error ordering and must not turn a failed
consumer operation into a successful one. No new AST/domain inference, fallback
value casting, signature casting, duplicate walker, canonical Array bundle edit,
or export/source type widening is proposed.

## Immutable positive fixture matrix

`test/fixtures/arcade/managed-number-boundaries.mjs` contains eight independent
source fixtures. Edit the actual connected VALUE leaf in each real generated
project, preserving its target and parent. Execute Number and text variants,
then Code, same-VM SB3 and fresh-VM SB3. Read results from the actual VM.

For captured-write, the setter receives 20 after its arithmetic expression is
replaced, so both variants return that setter value: Number 20 versus String 20.
For factory-argument, arithmetic remains and results are Number 21 versus String
201. All other paths return Number 20 versus String 20. Track once-only effects
where present. The fixture table describes the intended repaired contract, not
an assertion that every adapter is already implemented.

## Adversarial controls

The focused helper test distinguishes finite numeric spellings (including -0,
subnormal and exponent forms) from text and non-finite/malformed spellings.
It checks copied args, missing current loan, wrong consumer opcode, disconnected
connected input with a retained default shadow, parent mismatch, changed field,
changed opcode, stale leaf fields/inputs/parent args/parent key/shadow cache,
foreign runtime/target/container, changed primitive function, removed cache
operation, killed/removed thread and a fresh post-reload caller.

These are private execution-loan fixtures modeled on the existing return tests;
they do not substitute for actual engine integration. The utility has no managed
invocation lifetime lease: a still-current generic primitive loan may recognize
a Number after a separate return service is invalidated. The return consumer
must reject that revoked lease independently. This distinction is tested.

Before admitting each adapter, its actual native integration must additionally
prove malformed/default/foreign input stays unchanged or preserves the existing
error; Stop/reload cannot use an old frame, captured token or heap owner; new
legitimate calls work after restart; changed definition/prototype/body cannot
reuse old managed authority. A forged/disconnected procedure, wrong class method
or foreign instance must not borrow a matching name/signature. Preserve current
Number/String inputs, opaque references, Undefined and explicit error behavior.

## Remaining scope

Direct authored canonical Array argument builders are a separate owner scope.
No literal String is reparsed as Number or JSON. This proposal adds no SDK,
original, hosted GUI, full-program or hardware qualification claim.
