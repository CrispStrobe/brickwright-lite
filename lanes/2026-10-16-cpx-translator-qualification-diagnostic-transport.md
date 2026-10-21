## CPX translator qualification diagnostic transport — 2026-10-16

RELEASED — completed by the existing CPX owner; verified by Codex root,
branch `lane/cpx-qualification-compose-20261016`, supplier consumer source
PR1009 at `9fbc8d97e87c6c6c9ee74d71c7ceae96996d5d4a`, base main `8fe41c722`.
The user requested continued coding through the ordered integrations. Preserve
the existing translator owner's branch and every assertion, corpus input,
capture time, trace record, timing-limit fixture and runtime/compiler helper.
Own only the four diagnostic console writers in
`test/cpx-makecode-behaviour.test.mjs`: route the identical labels and serialized
records through that test's `t.diagnostic` instead of raw stdout. Merge claim
before implementation on a separate composition branch; preserve newer owner
work during final integration. No translator source, pin or oracle semantics
are transferred by this narrow qualification repair.

Hosted artifact from run38931471960 contains all15 passed tests under the
absolute file path, plus a separate relative-path stdout bucket with30125bytes.
The checker collapses basenames and the latter bucket masks those15 tests;
the genuine blocker is the prohibited raw stdout. Do not relax or edit the
checker, merge away the stdout evidence, hide diagnostics, or claim test cases
never executed. Require all15 existing cases to pass with zero raw stdout in
the actual two-reporter run, retained full diagnostic records, and unchanged
assertions. This does not claim timing parity for the five documented boundary
programs. Final candidate still requires every enabled exact-head CI check.

The existing owner published `16dda603dde74db3a820d88750b43aada25f91b8`
while this repair was being qualified. Its four framed diagnostic writers match
the proposed repair, with an explanatory comment. Preserve that implementation
and original PR1009; no duplicate source PR or full CI was requested. In an
isolated normal composition with current documentation-only main, the owner's
unchanged executable tree passes all74 focused CPX/import/export checks under
genuine Node22.23.3 and the actual TAP plus census reporters. All15 behaviour
cases are accounted for, zero raw stdout bytes or skips, and all108 diagnostic
lines are byte-for-byte identical to the proposed repair's passing trace.
Original diagnostic trace and census are retained by the operator.
Hosted final-head CI still
qualifies PR1009; five documented timing limits remain limits, not parity.
This narrow diagnostic claim is released; no translator ownership is retained.
