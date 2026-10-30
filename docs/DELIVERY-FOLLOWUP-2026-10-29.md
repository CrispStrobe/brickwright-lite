# Delivery follow-up — 2026-10-29

This is a snapshot. Refresh main, PR heads, enabled checks and ownership claims
before acting. Preserve original failures, pins, assertions and thresholds; use
normal pushes. A component success does not establish final application acceptance.

## Editor and circuit delivery

PR #1536 combines editor menus, Pixel and Graphics controls, FPGA workspace,
Robot manual controls, circuit integration and native test repairs. Candidate
`2e7846f8` was awaiting fast and full qualification. Earlier candidates had a
stale CI wiring assertion and an unsupported manual artifact-consumer route; the
current candidate contains repairs, but fresh qualification remains necessary.

Inspect both the automatic fast run and the already dispatched full run for the
current candidate; do not dispatch duplicates. Require every enabled check to pass
and verify actual browser journeys, the FPGA-enabled workspace and unchanged
initial JavaScript budget. The manual full run skips the unsupported numeric
consumer; the supported PR run must qualify it. Reuse retained originals. Diagnose
any failure at its cause. After qualification, normally merge the reviewed head,
verify the resulting tree, deploy through the guarded workflow, and check the live
version and editors at wide and narrow sizes. Update the editor and circuit handoffs
with the actual landed and deployed results.

## Arcade

PR #1554 is open with failing unit shards. Further repairs are prepared on the
owner's branch; source-only controls do not prove full project behavior. After
shared editor changes land, compose qualified main and the prepared candidate,
fix remaining actual failures, and run enabled checks plus affected PXT, native,
browser, export/reimport and SB3 acceptance. Callback and reference-array tests
can emit evidence on failure; coordinate capture with the workflow owner and
retain each original once. Reassess the corpus with authentic inputs; report
partials and refusals without promotion or invented artwork. See
`docs/ARCADE-AGENT-HANDOFF.md` for detailed boundaries.

## Robot and Paired Door

PR #1553 and PR #1551 remain open with failing checks. Related Robot evidence
identified shared circuit-study failures; use the qualified shared repair rather
than changing historical evidence or pins to silence tests. After integrating
qualified main, diagnose remaining failures from original job output, run affected
Robot physics and actual Door VM/Jolt programme cases, and merge only after enabled
checks and acceptance pass. State unresolved physics discrepancies and measurement
limits explicitly.

## Production workflow

PR #1507 remains open with failing checks. Its ancestry checks are useful, but a
fixture demonstrated that an independent production writer can advance the site
between the final check and publication. Repository workflow concurrency serializes
participating workflows, not independent dashboard or CLI writers. Before merging,
reconcile production-writer ownership and state this boundary accurately; do not
claim an unconditional atomic guarantee without a verified mechanism. Requalify
the final candidate and verify a real guarded deployment after merge.

## Closeout

Update the editor, circuit, Arcade and Robot handoffs after their actual outcomes;
mark claims complete only after their code lands. Record remaining failures,
reproduction and acceptance steps. Keep private operational details and raw
evidence outside public files. This snapshot does not replace current checks.
