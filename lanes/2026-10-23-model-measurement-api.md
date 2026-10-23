# Token-protected Robot Lab measurement API

DONE — Robot Lab model-intake owner, user-requested REST submission service.
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

Implemented the typed encrypted asynchronous gateway, PR1255-based worker,
part-local/signed-rotation/VM-phase/closure adapters, dedicated-worker workflow,
OpenAPI and agent client. Local auth/encryption/ownership/native and measurement
cohorts pass; real localhost HTTP returned a measured 32.01 mm passive stroke.
Initial server collision on another owner’s port was preserved and replaced
with a dynamically allocated own port, without touching that listener. Hosted
Docker/Actions and Vercel execution remain deployment acceptance requirements.
The earlier model-candidate fingerprint SILENT-SKIP is corrected by including
generated translations after their recorded build-side-effect restoration;
all eleven gate-shape controls pass without any baseline/tolerance change.
The private worker/planning repository keeps idea JSON edits off app CI.
Hosted acceptance now passes: the Vercel endpoint dispatched the pinned native
worker, returned its encrypted report, and measured a 32.0136 mm passive stroke
with 0.00192 mm maximum hinge closure error. Hosted missing-token, foreign-job
ownership and allowed/denied-origin controls pass. A separate 811-idea catalogue
audit, nine compact primary-domain queues and agent-owned atomic claims and task progress
live in the private planning repository; no catalogue edits trigger app CI.

Native pose reports now carry exact prepared placements after mat import, with a reusable read-only replay helper. A real hosted 316-frame, 5 ms recording reproduced the independent live semantic marker channel within one millionth of a millimetre; nine focused native/marker/replay controls pass. A separate primitive-envelope helper applies collider offsets/quaternions and checks real part metadata; its adversarial controls reject ignored end-cap offsets, flattened 3D distances, wrong metadata and scaled transforms. These observations grant no mesh or library admission.
