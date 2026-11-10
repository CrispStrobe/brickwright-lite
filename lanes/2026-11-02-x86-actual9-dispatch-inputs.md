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

Amendment: the second selected event reached the V10 installed inventory and
refused `node_modules/bw-circuit-ui/LANES.md` as a reviewed identity witness.
Main's pin moves had re-stamped `FINITE_V10_PINS` to Circuit UI
`4b65f15485abbc039958d8e1a8a29ac3459b75f9` without updating
`FINITE_V10_CUI_WITNESSES`. This PR re-measures all 18 V10 witnesses at that
exact Circuit UI commit (6 changed) in the producer and reader. Historical
V7-V9 witness tables are unchanged. That event slot is spent.

Amendment (third event, run 41628975547): the guard and witness fixes held on
the hosted runner, but the standalone reader refused the uploaded phase ZIP
before any ACK could be built. Its census cap `6*len(SOURCE)+35` (161) missed
the two originals the V10 guard writes before any Git call
(`guard-originals/template.original.json` and `event.original.json`); the real
upload had 163 regular members. The reader now bounds the census by the size of
the exact derived role roster, adds both members to that roster and requires
them to equal the F10 phase template and event bytes. The producer is
unchanged; it already writes them. The test fixture now mirrors the real
163-member upload, and over-roster or perturbed archives are refused. Main's
later pin move to Circuit UI `15416c7e11efaa52c68244fcf36ee31f1f6e99e4` is
merged with all 18 V10 witnesses re-measured, and the witness gate from
`lanes/2026-11-03-x86-v10-cui-witness-gate.md` now rides on this PR. That
event slot is spent; one further event follows the exact-head checks.

A read-only re-audit of that event's phase original with the census fix found
one more reader/producer disagreement: the producer observes the bootstrap
helper with plain `git ls-tree <head> -- <path>` (LF-terminated), while the
phase reader expected `ls-tree -z` with a NUL terminator. The reader and its
fixture now follow the producer. With both fixes the original phase ZIP is
admitted; perturbed and over-roster copies are refused.

Amendment (fourth event, run 42365788419): the phase was admitted and the ACK
published, but the guest step refused the official Pages build because it now
holds a 68.5 MB Yosys wasm and 8574 files, beyond the per-file and count
limits. That slot is spent. On the operator's instruction the V9 event step now
installs and serves only the reviewed frontend roster: 46 paths (8.7 MB of the
306.6 MB build), the GET requests seen while driving the same UI path as both
probe scenarios on the official build, plus the step's provenance file. A HEAD
availability probe for the LabWired wasm fetches no body and is not admitted. Each roster entry is an
exact path with only content-hash segments open and must match exactly one
member; other members are neither read nor installed. The count bound is the
roster length, each member keeps the existing 32 MiB limit and the aggregate is
bounded at 16 MiB. The whole-archive digest check is unchanged. Older protocol
versions keep the full-build policy. Product loading is not changed here.

The fifth event (run 42412052347) installed the subset, booted FreeDOS and
wrote and read the HDD marker, then the probe's Pause click was blocked by an
overlapping Widgets full-screen button. That slot is spent; the layout is fixed
separately.

Amendment 2026-11-10 (after the 7th event refused at the roster): numeric
webpack chunks are selected by ROLE, never by id. Producer and reader carry the
same 17 reviewed `ACTUAL_V9_FRONTEND_CHUNK_ROLES`, each one complete string
literal that must occur in exactly one `chunks/<n>[.<hash>].js` member; a
member with two role markers, a role matching zero or two members, or a named
roster entry matching a numeric chunk refuses. Named entries keep their exact
patterns, the 16 MiB aggregate and the per-file cap are unchanged. On the real
frontend archives of the 6th and 7th events (different chunk ids) the rule
selects exactly the measured UI-path set (46 files each). Tests add a
renumbered-build case and zero/two/zero-and-two/both-roles/unquoted cuts; four
executed mutants are killed.
