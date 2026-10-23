# Brickwright model measurement service

Vercel provides a bearer-authenticated REST facade. A dedicated GitHub Actions
worker checks out an immutable Brickwright runtime, executes model/program data
in an unprivileged, read-only, network-disabled container and retains an encrypted
result for one day. Agents never receive a GitHub credential or choose worker
code, repository, branch or executable scripts. GitHub Pages can host a static
client, but cannot run this compute endpoint.

The worker imports the live measurement reader from PR #1255. API extensions
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

- `MODEL_API_MASTER_KEY`: 32 random bytes as 64 hex characters.
- `MODEL_API_AGENT_TOKENS`: JSON array of `{id,sha256}` token digests.
- `MODEL_API_GITHUB_TOKEN`: server-only credential with Actions write/read on
  the worker repository; agents receive separate service tokens.
- `MODEL_API_REPOSITORY`: dedicated worker repository.
- `MODEL_API_REF`: its trusted default branch, normally `main`.

The worker repository holds `worker-workflow.yml` as
`.github/workflows/model-measurements.yml` plus a trusted `runtime-source.json`:
`{"repository":"CrispStrobe/brickwright-lite","commit":"EXACT_RUNTIME_COMMIT"}`.
Its repository secret `MODEL_API_MASTER_KEY` must match Vercel. The source and
result envelopes are authenticated/encrypted even if workflow metadata becomes
visible. The container receives no key, GitHub token, writeable code or network.
The dedicated dispatcher pins canonical runtime code instead of copying its
measurement implementation or sharing app release jobs.

The same workflow can run in the runtime repository using its tracked
`.github/workflows/model-measurements.yml` after that file lands on its default
branch. Do not run user-selected refs or scripts. Changes to pins/worker code
are administrator actions; model submission has no such authority.

For local development, configure master key and token digests and run
`node tools/model-api/dev-server.mjs`; choose `MODEL_API_PORT=0` for a free port.
This mode supervises a child Node process, without the hosted Docker sandbox,
and is only for trusted local callers. Its volatile job store is not a hosted
queue. Real hosted Docker/Actions execution must be verified separately.

## Replaying native poses

`poseRecording.initialPartPlacements` contains the actual prepared `runModel` placements for parts in recorded bodies, after the mat import transform. These positions and 3×3 rotations use LDraw units/axes; native body poses use metres and `[x,y,z,w]` quaternions. Do not reconstruct semantic markers using raw input LDraw placements or treat a body origin as a part origin.

Import `createRecordedPoseReader` from `lib/rigid-poses.mjs` and pass the report. `reader.point(frameIndex, partId, localLdu)` returns a semantic point in world metres; `reader.placement(frameIndex, partId)` returns a reconstructed LDraw placement. The helper carries the inverse initial body transform, refuses unavailable dynamic poses and ambiguous split parts, and allows an explicit body selector when needed. Old reports require the exact prepared `runModel.parts` as the second argument; raw authored parts are insufficient. These transforms observe recorded motion and do not grant mesh, retention or continuous-contact qualification.
