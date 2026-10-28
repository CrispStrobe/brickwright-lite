## SPIKE replacement output phase continuation — 2026-10-15

Continuation of the merged G02 session/feedback envelope, branch
`lane/spike-g02-output-phase-20261015`, following the frozen composed batch.
While replacement awaits its previous poll and STOP, then BEGIN/CHUNK/COMMIT,
admit the observed output sequence without publishing its text to the new Code
consumer. Admit execution output only after the original request's START reply
passes the existing operation/id decoder, succeeds and reports RUNNING, COMPLETE
or FAULT. Preserve immediate or terminal START output, later fresh output, retry
and Stop reentry. The Code caller token change is separately scoped below.

Thirteen authored controls execute the real session/client and shipped pane
consumers; the baseline passes five and fails eight. All thirteen and 112
affected host controls pass; ten broken output/sequence/reply guards are detected.
An earlier candidate admitted preparation and rejected/foreign START output;
those original failures remain preserved. A now-redundant source-null guard
change was removed after admission moved to START. Shared protocol helpers,
frame formats, native/firmware/Runtime/model sources and pins are unchanged.

These host API controls are complemented by the named frozen installed capture
above. Final documentation-head CI and exact-head merge review remain required. Do not infer physical UART attribution, new reference
mapping, whole G02, rollback, licensing or release qualification. Keep this
follow-up out of the already frozen composed-package qualification target.
