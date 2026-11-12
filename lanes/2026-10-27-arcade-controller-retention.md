# Known controller retention in the Sprite numeric invariant

Status: CLAIMED — implementation waits for the claim to merge.
Owner: Arcade integration, continuing its Sprite producer/export lane in an
isolated worktree. No runtime, supplier or other editor ownership transfer.

## Measured source boundary

The current export census has 22 refused inputs after 124 clean exports.
These are source observations, separate from the unchanged 147/36/1 import
census and from actual game completion. A small retained program creates
Sprites, passes one to `controller.moveSprite`, then updates a coordinate.
The existing complete Sprite-use census rejects that SDK argument position as
an unknown escape. A simple factory/property program without the controller
call already qualifies. Do not infer that every remaining Sprite case has the
same cause.

## Owned paths and implementation

Extend only the ordinary Sprite invariant in
`overlay/scratch-gui/src/lib/bw-makecode/source-value-producers.js`, focused
`test/arcade-controller-sprite-retention.test.mjs`, an affected hosted
SDK/native roundtrip test, small independent fixtures as needed, their exact
rows in `scripts/lib/gui-scope-allowed.json`, this claim and current Arcade
handoff/GUI documentation.

Recognize only the actual canonical `controller.moveSprite` SDK call, its
proved Sprite argument and supported arity. Preserve namespace ownership,
receiver allocation/writer/caller/escape census and construction-before-use on
every path. Explicit speed operands need independent Number producers and
readiness; an omitted or genuine Undefined argument may use only the actual SDK
default contract. Preserve original receiver/argument evaluation and the real
controller registration. The retained reference and native controller update
contracts must maintain the admitted numeric Sprite slots. Do not treat all
call arguments, methods, property names or nominal Sprite annotations as safe.

Other Sprite escapes, unknown or rebound namespaces/methods, dynamic calls,
unsupported overloads, early/foreign/nullable receivers, opaque speeds and
incompatible property writers remain refused. No general destroyed-object or
lifecycle admission, controller input values, fixed positions, Array/element
initialization or new Number badge is supplied by this retention rule.
Runtime implementations, descriptors, pins, workflows, budgets, thresholds and
existing expectations stay unchanged.

## Qualification

Add independently authored source fixtures with actual factory, controller
call and property addition through both direct and JSON APIs, Code and repeated
export/reimport. Negatives must cover wrong receiver/namespace/arity/arguments,
registration before allocation, later incompatible writes, unknown escapes and
observed mutation/restoration. Keep existing SDK Sprite, callback frontier and
class/accessor controls. Guard cuts must distinguish detected failures from
redundant independent refusals.

No builds or suites on the shared VPS. Qualify focused source controls and the
affected original SDK/Lite VM/visible controller behavior on GitHub CI or the
approved Mac. Keep dynamic input and original timing semantics; assert only
observed direction/domain unless an exact time/input contract is established.
Retain callback/input liveness witnesses and same/fresh project roundtrips.
Preserve originals and every refusal; promote no corpus input on source evidence.

The existing #1128 hosted candidate must finish and its terminal originals be
retained before its successor is published. Normal checkpoint pushes may use
the isolated source branch; do not supersede that active run or add `ci:full`,
duplicate dispatches or unchanged retries. Final integration still needs every
enabled exact-head check successful, matched head and verified parents/tree.
