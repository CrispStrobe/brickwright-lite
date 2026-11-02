# x86 Actual-V9 dispatch-input admission (claim)

Owner: x86 lane agent (Claude), on behalf of the repository owner.

Scope: PR #1627 only. Paths: `scripts/run-i80386-hdd-gui-actual.py`
(`bind_actual_v9_event`), `scripts/read-i80386-hdd-gui-originals.py`
(`bind_finite_v10_event`), one new control in
`test/i80386-hdd-gui-actual.test.mjs`, and the explicit re-review of their
frozen source profiles in `test/pin-move-chain.test.mjs` and
`docs/receipts/frozen-control-pin-admissions.json`; plus `docs/X86-NEXT-LANES.md`.

Change: GitHub omits empty-string `workflow_dispatch` inputs from the event
payload (observed for both `gh workflow run -f key=` and a REST dispatch with
explicit `""`). The first selected Actual-V9 event failed its source guard for
that reason and stays spent. The guards now admit exactly two forms: the five
selected inputs, or those five plus `request_sha256` and `tag_name` equal to
`''`. Any other key, value, omission or non-empty historical input still
refuses. No other gate, cap, reader role or protocol step changes.

Qualification: every enabled exact-head check with `ci:full`, a fresh
successful Build bound to the new head, then one new Actual-V9 event with
independent audit before a matched-head merge.
