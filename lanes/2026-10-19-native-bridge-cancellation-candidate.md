### Native bridge cancellation candidate — 2026-10-19

Claim PR1087 merged as `162398c09082470d586dcba21cb04187fafc844e` before
implementation. The candidate closes cancelled openings, releases late or failed
listeners, serializes native open/close and rejects replacement of a live owner.
Stale callbacks and repeated old closes cannot act on a new session. Failed
sends close the owner instead of silently discarding the error. Cancelling the
real-socket attempt also prevents its late failure from opening a fallback.
Canonical integration refreshes the packaged mirror; supplier pins and native
Rust/Swift remain unchanged.

The 17 original bridge controls pass. Seven new cancellation/failure/ownership
controls fail on the unchanged baseline and pass on the candidate, alongside
four additional registration/send/late-socket controls (28 total). Enabled
exact-head hosted checks remain mandatory before merge. No new iPad build or
physical connection acceptance is implied. A rejected native close reports an
error and blocks reuse of uncertain state; a native call which never settles
still requires the separately scoped native cancellation/readiness work.
