# Token-protected Robot Lab measurement API

CLAIMED — Robot Lab model-intake owner, user-requested REST submission service.
Isolated source branch `lane/model-measure-api-20261023` and worktree
`wt-model-measure-api-20261023`; compose the qualified model harness and the
public PR #1255 measurement implementation normally, preserving both ancestries.
Own new `tools/model-api/` service/worker/measurement adapters, API schemas and
documentation, focused protocol/native tests, deployment configuration and a
separate bounded workflow for submitted model-data jobs. Reuse #1255 readers;
do not fork or edit the live Measurements UI, physics telemetry or its owner's
claimed paths. Extensions for batch observations belong to the API adapter.

Accept LDR/MPD plus optional bounded Robot Lab BW as data, never uploaded
scripts/installers or caller-selected workflow code. Authenticate per-agent
bearer tokens server-side; keep GitHub dispatch credentials private. Return
asynchronous job status and finite measured time-series with units/provenance,
missing-target states, source/input identity and errors. Bound input, topology,
simulated time, recordings and wall time. Measurement completion is distinct
from reviewed mechanism qualification. Validate auth/refusal/ownership/error
controls and real native submitted models before any deployment; preserve failed
attempts. GitHub Pages can host a static client; Vercel fronts compute jobs.
No protected Jolt/compiler/collision edits, upstream pin changes, firmware,
native release, TestFlight, other owner worktrees or active CI changes. Keep the
existing immutable PR #1236 candidate and guarded landing untouched.
