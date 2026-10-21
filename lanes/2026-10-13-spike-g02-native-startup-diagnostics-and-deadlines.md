## SPIKE G02 native startup diagnostics and deadlines — 2026-10-13

CLAIMED — Codex SPIKE integration, isolated branch
`docs/spike-g02-native-startup-claim-20261013`. Coordinated extension of the
existing G02 lifecycle lane after PR879; implementation follows only after this
claim merges. Envelope: this ledger, `docs/SPIKE-STATUS-AND-LANES.md`, native
startup/session code in `apps/tauri/src-tauri/src/{renode_debugger,renode_supervisor,
renode_brick_state,native_capability,native_broker_adapter,native_broker_transport}.rs`,
their focused tests, `overlay/scratch-gui/static/native-broker/native-broker-host.js`,
and `overlay/scratch-vm/src/extension-support/native-broker-protocol.js` only if
required for the same validated startup/cancellation contract, with their focused
broker tests. Preserve other owners and coordinate before extending this envelope.

Acceptance: attribute the actual installed cold-start failure with bounded,
non-sensitive native phase/error evidence before changing behavior. Review the
request deadline against actual startup phases and supervisor limits; do not
increase all-operation timeouts or let editor inputs set budgets. Keep cancellation,
expired/late-reply refusal, ownership and ordinary operations live. Native diagnostic
tests must initialize trusted resources and fresh owned storage as app setup does;
preserve their original failures and distinguish private fixtures from product code.
Any implementation change requires affected clean installed cold-start, Stop/reset/
closure, fresh recovery and guest qualification plus enabled exact-head gates.
No new firmware/model/runtime pins, restricted image acquisition/inspection, physical
mapping, reference boot, release/licence, instantaneous abort or whole-G02 claim.

Native observation continuation: isolated branch
`lane/spike-g02-native-observation-20261013` prepares closed, bounded native
phase/result/elapsed records in `renode_debugger.rs`. Three extracted std-only
controls and three mutation adversaries pass; full native and fresh installed
qualification remain pending. Builds on the separately qualified PR895 source
candidate, whose hosted merge gates are still pending. No startup failure
attribution, deadline fix or full G02 completion is claimed.
