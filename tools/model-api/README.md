# Brickwright model measurement service

Vercel provides a bearer-authenticated REST facade. A dedicated GitHub Actions
worker checks out an immutable Brickwright runtime, executes model/program data
in an unprivileged, read-only, network-disabled container and retains an encrypted
result for one day. Agents never receive a GitHub credential or choose worker
code, repository, branch or executable scripts. GitHub Pages can host a static
client, but cannot run this compute endpoint.

The worker imports the shipped Robot Lab measurement reader. API extensions
add part-local marker coordinates, a current reference-part frame, signed
observed rotation, hinge closure and explicitly labelled VM program variables.
Responses contain sampled values, units, provenance, availability and
min/max/mean/span/RMS summaries. Saved-pose solid overlaps include physical part IDs; this is a partial construction diagnostic, not full mesh/sweep/retention qualification. Force readings are existing rope tension and
rolling-load estimates; there is no invented general contact force or torque.
Reports echo the actual normalized measurement definitions and settings, so a
reviewer can distinguish a world-frame observation from a relative coordinate
that would hide foundation motion. Inferred couplings include their actual
gear part/joint IDs and ratios, with an explicit truncation flag above 256.

## HTTP interface

Every API request uses `Authorization: Bearer $MODEL_API_TOKEN`.

- `GET /api/v1/capabilities`: supported quantities and bounds.
- `POST /api/v1/runs`: JSON model, optional BW, settings and measurements; 202
  with a signed job id and polling URLs.
- `GET /api/v1/runs/{id}`: queued/running/completed/failed worker status.
- `GET /api/v1/runs/{id}/result`: completed or failed measurement report;
  another agent's id returns 404. A pending report returns 409.

Example request:

```json
{
  "model": {"name": "machine.mpd", "text": "0 FILE machine.ldr\n..."},
  "program": {"name": "experiment.bw", "text": "DEVICE SPIKE\n..."},
  "settings": {"programMs": 60000, "coldMs": 250, "afterMs": 500, "sampleMs": 50},
  "measurements": [
    {"id": "input", "kind": "jointAngle", "port": "A"},
    {"id": "output", "kind": "pointCoordinate", "point": {"part": "output_marker", "localLdu": [0,0,20]}, "reference": {"part": "hub"}, "axis": "x"},
    {"id": "phase", "kind": "programVariable", "variable": "stage"}
  ]
}
```

`model` accepts one LDR or MPD; `program` is optional. A BW alone needs a matching
model. Without BW the service observes an unpowered scene for the requested
budget. With BW it observes the finite program until completion or its program
time budget, plus an optional settling tail after completion. A continuous
program reaching its requested observation budget is labelled accordingly.
A fresh fixed model starts running before the flag; scene load/reset/pause
commands and non-Robot-Lab extension code are refused. Motor stop commands work.

The body limit is 1 MiB, model 768 KiB, BW 64 KiB, encrypted/compressed dispatch
45,000 bytes, 2,000 parts, 64 dynamic bodies, 256 joints, 64 requested readings,
120 s program time, 30 s settling tail, 2,001 recorded samples and 180 s worker
wall time. Timing settings use multiples of 25 ms; internal physics stays 5 ms.
Large recordings are downsampled, with the actual sample interval reported.

For short contact-sensitive experiments use:

```json
{"programMs":12000,"coldMs":250,"afterMs":500,"sampleMs":5,
 "physicsSamples":true,"poseParts":["hub","gate_main_axle","ball_direct","ball_fast"]}
```

This observes **every existing 5 ms bridge step** after physics and encoder
updates. VM commands retain their original 25 ms timing; it does not change the
controller, solver, collision settings or physical step. The dense profile has
a 15 s **total** budget including cold/after, 24 scalar readings and 3,001 rows.
It never silently downsamples physics-step recordings. Complete recorded poses
still do not by themselves prove continuous contact clearance between steps.

`poseParts` selects at most four semantic part IDs; targets on the same body
share one recording. Unknown targets are refused. `poseRecording.bodyIds`
defines the ordering of each frame's positions and quaternions. Positions are
**metres** in actual Jolt world coordinates; rotations are `[x,y,z,w]`, at full
native precision. Topology contains each body's initial position/rotation for
reconstructing attached part geometry. Scalar point coordinates remain **mm**.
Frame/part axes and the actual ground datum must be respected; do not assume
the floor is world Y=0. Normal-profile pose captures use the reported sample
interval and explicitly do not claim every physics step. Results above 4 MiB
are refused with `recording-limit`, rather than silently dropping observations.

Marker offsets are LDraw units. World coordinates use Jolt's axes; reference
coordinates follow the current reference part's authored axes. Signed rotation
is observed and unwrapped at 25 ms; native joint angle is preferable above that
sampling bandwidth. Selecting a motor part can identify its housing assembly;
use its joined shaft/crank or select the motor joint by port for shaft motion.

A measurement report always says `qualification.status: not-evaluated`.
Successful execution does not approve physical retention, continuous clearance,
the intended principle, rendering, lessons, licensing or library admission. Use
the independent model qualification harness for that separate decision.

## Agent client

Set `MODEL_API_URL=https://SERVICE/api/v1` and a per-agent `MODEL_API_TOKEN`, then:

```sh
node tools/model-api/client.mjs --model=machine.mpd --program=experiment.bw \
  --measurements=measurements.json --out=attempt-001.json
```

The client preserves old reports and polls a bounded interval. Each agent token
has independent result ownership and can be revoked through server configuration.
Credentials stay out of query strings, source code, browser bundles and logs.
Use `--settings=settings.json` for an explicit experiment budget. The client
writes `<out>.job.json` immediately after submission so an interrupted caller
can resume polling the retained job rather than submit duplicate work.
Resume with `--resume=attempt-001.json.job.json --out=attempt-001.json` after a
queue timeout or interrupted terminal. This mode never POSTs a new request.
Transient GET failures receive bounded retries; submission POSTs are never
automatically retried because their acceptance may already have dispatched work.
Before submitting, the client also preserves `<out>.input.json` containing the
exact model/program text and request settings. The saved job binds their hashes;
a completed result with different input hashes is retained but refused. Preserve
these snapshots when repairing a design so original failing inputs remain usable.

## Deployment

The Vercel project root is `tools/model-api`; its only package dependency is the
pinned JSZip decoder. Configure production environment variables:

- `NODEJS_HELPERS=0`: required in every supported Vercel deployment environment,
  so the handler reads the raw request stream rather than the host body helper.
- `MODEL_API_MASTER_KEY`: 32 random bytes as 64 hex characters.
- `MODEL_API_AGENT_TOKENS`: JSON array of `{id,sha256}` token digests.
- `MODEL_API_GITHUB_TOKEN`: server-only credential with Actions write/read on
  the worker repository; agents receive separate service tokens.
- `MODEL_API_REPOSITORY`: dedicated worker repository.
- `MODEL_API_REF`: a reviewed immutable lightweight tag name, with no same-name branch.
- `MODEL_API_WORKER_REVISION`: the exact 40-character worker commit at that tag.
- `MODEL_API_ADMISSION_REPOSITORY`: an explicitly configured private repository
  owned by the worker repository owner; never a public repository.
- `MODEL_API_ADMISSION_BRANCH`, `MODEL_API_ADMISSION_TOKEN` and
  `MODEL_API_ADMISSION_EPOCH`: reviewed ledger branch, server-only Contents
  write credential and stable policy epoch (16–128 alphanumeric/underscore/dash).

The supported host must pass the raw request stream to the handler. Vercel's
body helper otherwise parses supported content types before this code can apply
its stream limit and can throw while accessing malformed JSON. Disable helpers
using the documented `NODEJS_HELPERS=0` environment setting; a Next.js-style
`bodyParser` export is not evidence that Vercel helpers are disabled. See the
[Vercel helper configuration](https://vercel.com/docs/functions/runtimes/node-js/advanced-node-configuration#disabling-helpers-for-nodejs).

Before enabling a deployment, verify its exact source and helper configuration
with actual hosted requests: unauthorized bodies must not reach a backend,
oversized declared and chunked requests must be refused, and interrupted or
stalled requests must remain bounded. The Node loopback handler checks do not
qualify Vercel's transport, buffering, cancellation or cold-instance behavior.
No deployed-service acceptance is implied by the worker or provider tests.

Production refuses missing admission configuration. An operator must separately
review and initialize the signed `model-api-admission.json` on that private
branch. The service only updates an existing file with its current blob SHA;
there is no automatic creation, reset or deployment step. The branch must not be
manually rolled back, force-updated or reset while jobs may still run. This
protocol cannot protect against an administrator reverting accepted history.
The pure `initialAdmissionDocument` helper prepares bytes without writing them.
No private repository name or credential belongs in public configuration.

The ledger admits at most eight accepted nonterminal jobs globally and two per
agent, including queued/running jobs and uncertain dispatches. Simultaneous cold
instances use GitHub's current-blob SHA update precondition; conflicts retry at
most four times. Corrupt, public, unauthorized, missing or contended stores fail
closed. Request/ledger/artifact bodies, record counts and network deadlines are
bounded before whole-body allocation. The single `result.enc` ZIP layout is
admitted before JSZip metadata parsing; native inflation has an 8 MiB output
cap, followed by explicit CRC and UTF-8 checks.

A network error after dispatch may mean the worker accepted the job. Such slots
stay occupied, including after token/job expiry. Only a trusted terminal run
with matching repository, workflow, owner/nonce correlation and actual source,
or a proved refusal before dispatch, releases capacity. Missing, foreign or
expired run metadata never frees a slot. An uncertain slot can therefore block
availability until independently resolved; resetting the ledger is unsafe.
Revoked token owners retain their live reservations until trusted reconciliation.

The tracked worker workflow and `worker-workflow.yml` template are identical.
Production `workflow_dispatch` checks out the accepted source and uses only the
configured production master key. Its encrypted request/result binds the exact
normalized input, job nonce, owner and runtime revision. A tag preflight cannot
prevent an administrator moving it during dispatch; observed source mismatch
fails closed and retains capacity. Do not configure mutable refs.

The automatic own-repository PR qualification is separate: a fixed public model
and manufactured public key exercise real Docker/Jolt execution, real trusted
prepare/seal and encrypted artifacts with source/input/report joins. The worker
container receives neither key nor GitHub token. Qualification-only controller
modes refuse production contexts/keys, and production never falls back to that
key. Actual native controls compare repeated default VM/Jolt runs against the
optional observer at the same 25 ms command cadence and unchanged 5 ms physics.
They observe one original bridge step and read afterward. This qualification
covers the model worker, not installed firmware, private-store operation,
deployed service acceptance or physical accuracy. Those boundaries require a
separate concrete deployment review before enabling service configuration.

`dev-server.mjs` binds loopback and uses the same production handler and durable
admission requirements. It does not bypass admission with a local child worker.
The retained `lib/local-backend.mjs` is an unused prototype, not a hosted queue.

## Replaying native poses

`poseRecording.initialPartPlacements` contains the actual prepared `runModel` placements for parts in recorded bodies, after the mat import transform. These positions and 3×3 rotations use LDraw units/axes; native body poses use metres and `[x,y,z,w]` quaternions. Do not reconstruct semantic markers using raw input LDraw placements or treat a body origin as a part origin.

Import `createRecordedPoseReader` from `lib/rigid-poses.mjs` and pass the report. `reader.point(frameIndex, partId, localLdu)` returns a semantic point in world metres; `reader.placement(frameIndex, partId)` returns a reconstructed LDraw placement. The helper carries the inverse initial body transform, refuses unavailable dynamic poses and ambiguous split parts, and allows an explicit body selector when needed. Old reports require the exact prepared `runModel.parts` as the second argument; raw authored parts are insufficient. These transforms observe recorded motion and do not grant mesh, retention or continuous-contact qualification.

For conservative sphere/support envelopes, `lib/collider-clearance.mjs` exports `spherePartClearanceMm(worldCenterM, radiusMm, preparedPlacement, partMeta)`. Pass the actual recorded part placement and matching catalogue entry. It applies part matrices **and each collider's own translation and quaternion**, handles box/cylinder/sphere/capsule primitives in LDraw units, and refuses missing/mismatched/unsupported geometry and scaled transforms. Use the actual metadata for every support; equal-looking beams can have different lengths or offset rounded caps. The result is distance from the sphere centre to the primitive union minus its radius, in millimetres. Primitive envelopes do not describe connector holes or establish actual-mesh clearance, continuous contact, or physical buildability.
