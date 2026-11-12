# Owned Image origins in ordinary native addition

Status: DONE — source implementation in the integration candidate. Hosted SDK, VM,
editor qualification and landing remain pending.
Owner: Arcade integration in #1128, preserving the existing forward-fix history.
Base: main `a7f688940f96ac89771dfc533ea17dab635703b5`.

## Measured gap and required behavior

The existing owned `test/makecode-arcade-image-values.test.mjs` fixture imports
and reconstructs cleanly but export refuses `first + 2`, with its operand
reported as an initialized Image. Preserve its complete source, native/original
comparison, alias/clone/Array identity assertions and round trips.

Prove actual Image origins rather than accepting an Image annotation or graph
kind. An owned Image is non-Array, not a primitive or Number certificate. Keep
the original ordinary addition helper only when every actual caller operand is
proved primitive or an owned Image and no Array addition reaches that same
helper. An unrelated Array must have no influence. Mixed Image/Array helper
families remain refused unless separately qualified call-site specialization
preserves every evaluation; a generic object-to-Array join is incorrect.

## Owned implementation paths

- `overlay/scratch-gui/src/lib/bw-makecode/image-pixel-normal-results.js`:
  retain its existing Number query and add a separate exact Image-origin query
  covering **all** normal observations of an actual expression occurrence.
  Any non-Image observation permanently disqualifies it; zero observations do
  not prove anything. Use actual per-allocation identities for alias/clone
  comparisons and bounded, audited Image operations required by the fixture.
- `overlay/scratch-gui/src/lib/bw-makecode/native-array-binary-domain.js`:
  consume those origins through a faithful private operation view with original
  operand order/effects. Do not execute a type-only zero/Conditional projection
  as though it supplied original runtime values or branches. Preserve original
  unary/arithmetic bodies and every declaration/caller/currentness check.
- `overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js` only if helper
  selection plumbing needs an explicit result. No fallback from the first
  Image refusal; require the complete current caller proof.
- Focused source-origin/domain tests, the existing Image-values test for an
  additional Array-free original/native/export control, any exact GUI test
  scope row required, this claim and Arcade handoff/qualification documentation.

Do not change SourceGraph Image/type/initialization authority, VM arithmetic,
pins, runtime algorithms, assertions, thresholds or supplier files. Unknown
calls, escaped/exported entries, namespace/method/prototype replacement and
unsupported observations deny the new proof. No public metadata grant.

## Qualification

Bounded source controls must cover repeated Image/non-Image observations,
factory/echo/clone identities, mixed Image/Array refusal, mutation/restore
expiration and original operand/call order. Preserve every old successful
primitive/flat-Array path independently. No local SDK/VM/guest execution.

Keep the original hosted Image-values fixture assertions unchanged. Qualify
actual original/native execution, Code, JSON/SB3 reopen and affected editor
journeys on the final exact integration head. Source acceptance alone is not a
runtime or application completion. Use one coordinated final automatic CI set;
merge only after every enabled exact-head check succeeds with tree/parents proof.

The source proof now records all normal observations, preserves per-allocation
Image identity, follows original arithmetic/argument order and refuses mixed
observations or unknown effects. Ordinary Image selection is exporter-only;
the source importer never erases an authored Image.join failure. Direct and
JSON source round trips pass for the original factory fixture and its
Array-free sibling. Costume-backed first export passes through the real wrapped
frame selector; the generated source-entry Image bank still needs a separate
second-export continuation, scoped in the Arcade handoff. No GUI, runtime or
application completion follows from the source checks alone.
