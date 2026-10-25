## SPIKE replacement upload cancellation after STOP — 2026-10-15

Continuation in the merged G02 session/test envelope, branch
`lane/spike-g02-upload-cancellation-20261015`, same Codex owner.
When a replacement upload awaits its initial STOP response, a concurrent session
Stop used to let the resumed method replace the source and begin a new upload
after closure. Check closure after that awaited response, before changing source
or enqueueing BEGIN. Also check closure after the upload reply returns, before
retained-program state or observers are published. An already executed upload
cannot be rolled back by cancelling delivery of its result. Keep the serialized
transport's existing STOP ordering.

A real session and production codec with an authored delayed STOP response
reproduce the gap: the normal control passes and cancellation fails on the
baseline. A second completed-upload return control also reproduces late
publication after closure while retaining real codec execution. All 59 session
controls pass with both guards; each guard removal must fail its corresponding
cancellation control. This is host boundary evidence, not a guest
result. Source-bound installed own-NuttX cancellation, fresh recovery and every
enabled exact-head CI check remain mandatory before integration. Firmware,
Runtime, models, native code, pins, workflows and budgets are unchanged; no
whole-G02, rollback, physical, reference or release claim.


Installed qualification completed on tested consumer
`516557dae2f3b29710318a0e9ee647715728376f`. Four real own-NuttX Code replacement
cases pass: cancellation and normal delivery while the original STOP reply is
held, and cancellation and normal delivery while a completed upload return is
held. Actual Arena Reset invokes full pane/session Stop for cancellation. Each
case releases ownership, completes a different fresh guest and releases it on
final Stop. Standalone readers verify the original correlated STOP replies,
completed-upload START replies, fixed guest identity and eight complete native
startup transactions. The initial retained program is checked separately from
the flag at the held-return boundary; no closed-session program/frame callback
is admitted. Original selector and state-interval test failures remain preserved.

This qualifies the frozen consumer and finite session boundaries. Pending-upload
Arena Stop availability and Code feedback remain open; Reset coverage does not
establish that UX. An executed upload remains executed. The session and test
blobs are preserved during integration with separately qualified main changes;
final-head CI remains required, and later whole packages need their own evidence.
