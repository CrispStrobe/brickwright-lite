## Native Scratch Link cancellation and reconnect ordering — 2026-10-19

CLAIMED — Codex root, branch `fix/native-bridge-recovery-20261019`.
Current-source deterministic deferred-promise probes reproduce a closed socket
reopening after event registration, a listener retained after native open fails,
and a new open dispatched before the previous native close completes. These
are source defects; they do not establish the cause of the reported physical
iPad cold-start symptom.

Own `overlay/scratch-gui/src/lib/native-scratch-link-bridge.js`, its canonical
`packages/scratch-gui` mirror, focused `test/scratchlink-bridge.test.mjs` controls,
and this ledger plus the WeDo/iPad handoff. Guard asynchronous opening and
outbound delivery against cancellation, release listeners on every failure,
and serialize bridge open/close transitions so a late old close cannot tear
down the next connection. Close must also cancel a pending real-socket fallback
without later starting its bridge. Keep unrelated WebSockets and explicit
transport preferences working. Reject stale work; retain bounded extension
waits, existing protocol semantics, service permissions and supplier pins.

No automatic retry loop, new timeout, native Rust/Swift change, firmware or
buzzer claim is included. Native readiness/session changes need separate
source evidence and ownership. Merge this claim before implementation; require
deferred cancellation/failure/overlap controls that fail on the baseline,
canonical mirror freshness and every enabled exact-head check before source
merge. Hardware acceptance separately requires cold launch, cancel, immediate
retry and disconnect/reconnect on the iPad without restarting the app. Keep
receipts, screenshots, device identifiers and machine paths gitignored.
