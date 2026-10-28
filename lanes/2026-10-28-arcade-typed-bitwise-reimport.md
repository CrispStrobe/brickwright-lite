# Typed-bitwise procedure reimport fidelity

Status: SOURCE CANDIDATE; the claim is landed and the implementation is isolated.
Original-PXT/native qualification and integration remain pending; ownership is
retained until that evidence is available.
Owner: Arcade typed-bitwise repair, explicitly available for an independent
worker. Deliver an isolated normal-pushed candidate to the integration owner;
do not push or supersede the active integration branch.

A retained failing original at integration head `cac03f21` imports an uncalled
`actor: Sprite` helper, exports it with `actor: any`, then refuses the flags
bitwise expression on reimport. A bounded source-only roundtrip reproduces this
without the SDK, browser or native VM. That observation does not establish
which producer/inference stage needs repair.

## Scope

Own only the necessary procedure parameter rendering/inference repair in
`overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js`, the directly affected
scalar-flow or closed-entry helper if necessary, a focused new
`test/arcade-typed-bitwise-reimport-fidelity.test.mjs`, its exact GUI scope row,
this claim and the Arcade handoff. Existing
`test/makecode-arcade-typed-bitwise.test.mjs` remains the unchanged hosted
original-PXT/native/Code/archive roundtrip acceptance test.

Keep original parameter declarations and executable body/evaluation semantics
faithful. Derive any rendered declaration from actual current graph/procedure
semantics; never mint initialized Sprite or numeric facts from a name, annotation
or unreachable body. A dead-helper exception must use the existing closed
whole-program reachability proof and revoke on added calls/escapes or edits.
Reached unknown operands and malformed/ambiguous procedures remain refused.
Prefer fixing lost export information over loosening import validation.

Do not edit the separate native-addition SDK/callback admission, supplier pins,
runtime adapters, workflows, budgets, existing expected values or diagnostic
thresholds. A new admission outside this export-fidelity scope needs a separate
claim and ownership agreement.

## Qualification and delivery

Cover both direct and JSON exports, Code rebuild, repeated import/export and
saved archive reopen with preserved helper bodies. Add reached opaque and
wrong-receiver negatives, mixed writers, shadowing and graph mutation cases
where applicable. Remove the actual fix and require a meaningful assertion
failure, then restore the exact source.

Keep the original typed-bitwise hosted test and prove the native/exported program
agrees with the original pinned PXT runtime. Source probes alone do not close a
corpus row. Preserve corpus bytes, denominator and existing originals; acquire
no other worker's log or artifact twice. Builds and suites stay off the shared
server. Use existing hosted qualification or an approved external worker; avoid
extra full-CI labels, duplicate dispatches and unchanged retries.

Publish normal checkpoint pushes only. The integration owner composes the
reviewed candidate, refreshes main and qualifies the complete final head before
matched-head merging with verified parents/tree.

## Source checkpoint

The exporter reconstructs a declaration-only `Sprite` formal when the existing
closed ordinary-entry proof establishes that the whole procedure is unreachable
and every actual read of that formal is precisely a flags receiver. Physical
block uses must agree with emitted TypeScript lexical bindings and read counts.
Writes, mixed uses, ambiguous formals and generated/global/local name captures
deny this fallback. Explicit procedure constraints retain precedence. This does
not populate the live value graph or grant initialized Sprite/Number authority.

The focused regression has 14 passing source tests, without skips. It covers
both public export routes, three reimports, Code rebuild, SB3 project reopen,
live opaque refusal, malformed graphs and binding collisions. Removing only the
final signature override produces two expected positive assertion failures;
restoring the exact source restores all 14 passes. Original failed fixture
expectations were corrected to preserve existing scalar inference and visible
malformed-operand refusals, without relaxing product acceptance.

These source results do not close a corpus row. Next, qualify the unchanged
`test/makecode-arcade-typed-bitwise.test.mjs` with its original pinned PXT/native
and Code/archive comparisons on an external builder, compose the narrow patch
with current integration/main, and require every enabled final-head check before
landing. Preserve the separate declared-reference Sprite-return failure and all
other integration failures. No supplier pin or existing acceptance test changes.

### External qualification recipe

Use Node 22 in a clean checkout with the repository's locked dependencies,
canonical integrated GUI/VM sources, synced pinned Arcade runtime under
`packages/scratch-gui/static/makecode/arcade`, and Playwright Chromium available.
Use the existing integration/runtime setup for that checkout; do not borrow a
mutable neighboring checkout, update pins or replace the original simulator.
The normal GUI scope loader, rather than a custom source-probe loader, must be
active for acceptance:

```sh
node --import ./scripts/lib/register-gui-scope.mjs --test --test-concurrency=1 test/arcade-typed-bitwise-reimport-fidelity.test.mjs test/makecode-arcade-typed-bitwise.test.mjs
```

Retain the first result with the exact tested commit and dependency/runtime
identities. A missing setup input is an unavailable qualification, not a pass.
Fix genuine failures on the owning branch, preserve their originals, and run
final composed-head qualification. Do not rerun an unchanged failed original or
claim native parity from the focused source-only results above.
