# Selected SDK Sprite constructor scalar effects

Status: CLAIMED; merge before implementation. Base: `681f61fea139a656ed6016a489bbf3ce38ac67af`.
Owner: Arcade integration; preserve the separate Image consumer ABI lane.

## Actual boundary

The unchanged constructor-virtual Sprite fixture imports and constructs Creator
blocks cleanly. A retained source-only reconstruction first refuses the captured
trace read inside Game_mark as Undefined/String/Opaque. It does not establish
that this is the only later failure. The original test expects FI34KC and 86.5;
retain that program and every assertion. Existing SDK-subclass/override and
captured-closure exclusions are intentional until actual effects are proved.

## Narrow implementation envelope

A new private `overlay/scratch-gui/src/lib/bw-makecode/sdk-sprite-constructor-scalar-effects.js`
may expose only a module-issued actual-current
SDK constructor/virtual-call effect bridge to `overlay/scratch-gui/src/lib/bw-makecode/native-class-scalar-view.js`.
Audit `overlay/scratch-gui/src/lib/bw-makecode/native-sdk-sprite-source.js` for the exact canonical selected SDK Sprite
constructor, setImage and setKind ownership; change it only if an independently
needed source query cannot be composed. `overlay/scratch-gui/src/lib/bw-makecode/native-array-binary-domain.js` may consume
the resulting private current fact, without widening generic primitive authority.
New `test/arcade-sdk-constructor-scalar-effects.test.mjs` must cover unchanged fixture import/Creator/export,
Code and own SB3 plus negative controls. Add only its exact GUI-scope row.
Existing actual SDK Sprite/ExtendableSprite suites remain unchanged. Update this
claim and the existing Arcade handoff, next-step and GUI ledgers.

Support a bounded synchronous closed subset first: actual SDK parent identity,
source subclass allocations, constructor/parameter-property/field initialization
order, exact virtual overrides and their direct super calls, real primitive
argument producers, captured declarations and every actual writer/caller.
Images admitted for these constructors require an existing owned source/image
producer path, not an Image annotation. Distinguish primitive normal returns,
actual initialized reads and completion; unknown external code, escapes,
callbacks, reentry, pause/yield and unsupported overrides remain unproved.
Do not remove the SDK ancestry exclusion globally or label fields by spelling.
A trace read initialized before the actual constructor call cannot be certified
by a declaration that executes later. Keep pre-super/partial construction facts
separate; do not seed fields from eventual final values. Used facts expire on
observed source/descriptor/call-order changes and never revive after restoration.

No runtime, SDK, parser, dependency pins, vocabulary, baseline, workflows,
timeouts, thresholds, source Array graph or unrelated lanes change here.
Unknown factory/namespace replacement, foreign/cyclic/dynamic callers,
conditional/late initialization, mixed writers, unsafe arguments, forged roles
and changed source must retain refusal. Cuts must detect lost identity, effect,
writer/readiness and currentness guards. Source tests do not qualify SDK/native.
Require actual unchanged original/emitted MakeCode, native execution, Code/Blocks
and same/fresh saved-project checks on the final composed head; all enabled
exact-head checks and matched merge tree/parents are mandatory before landing.
