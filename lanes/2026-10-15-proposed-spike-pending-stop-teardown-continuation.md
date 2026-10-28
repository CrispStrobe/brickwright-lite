## Proposed SPIKE pending Stop teardown continuation — 2026-10-15

A direct second pane `stopProgram()` while the visible Code Stop's original
teardown is pending can encounter `Clock is owned by another backend`. The
closed flag and stopped Code feedback precede full ownership release. The
frozen lifecycle qualification observes the original Stop promise and preserves
this repeated-call failure separately; it does not claim arbitrary Stop reentry.

Proposed next bounded G02 slice: serialize pending firmware teardown before a
later Stop or Start tries shared clock/backend cleanup, while preserving pane
intent ownership and original error delivery. Own only the existing pane's
`stopProgram` method, a focused pending-Stop test, this ledger and the SPIKE
guide; other shared pane methods require their existing contracts. Preserve
current teardown/replacement/disposal positives, failure and listener reentry
adversaries, and qualify the affected installed own-guest cleanup/recovery
before exact-head merge. No implementation or new guest result is claimed here.
