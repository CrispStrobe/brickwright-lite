# Owned Image origins in ordinary native addition

Status: CLAIMED; merge before implementation.
Owner: Arcade integration in #1128, preserving the existing forward-fix history.

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
