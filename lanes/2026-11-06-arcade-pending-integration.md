# Arcade pending integration and qualification

Status: ACTIVE. Owner: Arcade integration. Base: current main at claim landing.

Reconcile pending PR #1643 with current main, preserving both branches' Arcade
semantics and tests. Scope: its existing importer, exporter, VM inspection,
tests and GUI-scope paths; Arcade handoff and TODO documentation; and this
claim. Separately qualify the prepared original-PXT test-session lock in #1645
and reconcile the pending-task documents in #1645 and #1648. Preserve all
other owners' work, original failures and existing assertions.

Qualification: review the combined tree and affected original-PXT, VM and
export controls, then require every enabled exact-head CI check. Re-run the
184-input source/Creator census after landing; report its scope and failures.
Update the handoff with current evidence and remaining authoring work. No pin
or workflow changes are included.
