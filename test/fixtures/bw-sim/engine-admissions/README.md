# Current engine admission

`bw10.json` separates a future current engine from the unchanged bw.9 floor and
resting observations. Its status is **pending** and its new archive, canonical
source and qualification digests are null. This is not release evidence and
does not permit a pin change.

`bindEngineArchive(record, actualTgzBytes)` computes SHA256 and npm SHA512 from
the actual eventual bytes while retaining the pending status. Admission then
requires the actual canonical native/binding commits, independent qualification
summary digest and both scalar/SIMD module digests. The producer URL, root lock
dependency and installed lock entry must match that one exact admitted package.
No unknown, partially populated or merely hash-filled pending record can select
the new engine.

The retained package identity and a fixed census of 31 original input, kernel,
observer and standalone-reader files are protected by the admission helper's
provenance digest and re-read byte hashes. Their original manifests and numerical
bounds are unchanged. A retained current bw.9 pin remains valid while bw.10 is
pending; it is never silently treated as the new engine.

Current resting observers reuse the original physical observation functions.
Current independent readers reuse the original row/contact validation and
recomputation functions with an explicit current-engine identity. The floor
current actor/qualifier/reader changes identity routing only; source controls
compare their physical and numerical validation blocks against the retained
originals. Historical scripts remain available unchanged and keep refusing
records from another source/engine identity.

The actual floor/old-kernel failure, contact and passive-resting cases must still
run against the newly packed engine under their existing clocks, case census,
recovery bounds and assertions. Admission preparation and synthetic hash controls
do not substitute for those executions. Resting drift remains a diagnostic with
no invented acceptance threshold.
