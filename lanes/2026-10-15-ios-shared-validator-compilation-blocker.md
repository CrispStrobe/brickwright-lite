## iOS shared validator compilation blocker — 2026-10-15

CLAIMED — Codex, isolated `fix/ios-shared-validators-20261015`, base `10edc699d`. Bounded build repair
found while fulfilling the user-requested current iPad deployment.

Envelope: this ledger and only the module declarations for `arena_inputs` and
`spike_program_uart_contract` in `apps/tauri/src-tauri/src/lib.rs`. Both contain
pure JSON validators already called by the shared `native_policy` core; their
current desktop gates cause eight E0433 errors on `aarch64-apple-ios`. Keep all
native commands, adapters, supervisors and platform integrations gated exactly
as before. Verify by the real signed iOS build, whose baseline failure is retained in operator diagnostics.
No simulator behavior or policy admission
rules change. Claim lands before implementation.
