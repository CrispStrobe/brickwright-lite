# x86 V10 Circuit UI witness gate (claim)

Owner: x86 lane agent (Claude), on behalf of the repository owner.

Scope: one new host test, `test/x86-v10-cui-witness-pin.test.mjs`. It checks
that the Actual-V9 producer and reader declare the canonical Circuit UI pin in
`FINITE_V10_PINS`, carry identical `FINITE_V10_CUI_WITNESSES` tables, and that
every witness equals the installed bytes of that pin. A pin move that does not
re-measure the witnesses then fails ordinary CI instead of a one-shot hosted
event. No producer, reader, workflow or pin change.

Qualification: every enabled exact-head check with `ci:full` on the final head.
