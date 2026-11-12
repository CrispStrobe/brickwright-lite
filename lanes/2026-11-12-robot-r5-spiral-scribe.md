# Robot Lab R5 — Spiral Scribe rack and feed

Status: CLAIMED — investigation and qualification pending.
Owner: Robot Lab R5 continuation.
Branch: `lane/robot-r5-spiral-scribe-20261112`.

Determine whether a real stock rack can replace the current 64781 rack while
preserving physically connected pin holes, tooth engagement, clearance and the
model's full travel. The current documented rack pitch and pinion-law mismatch
is an open physical constraint; do not hide it by changing pitch metadata or
loosening a tolerance. If no buildable candidate is demonstrated, keep Spiral
Scribe experimental and record the precise remaining gap.

Scope: Spiral Scribe model and generated wrapper, its own fixture/program only
if demonstrably necessary, focused construction/geometry and independent
`radial-feed-v1` law/control qualification, its own registration and status
notes. Coordinate before editing shared registration, browser gates, generated
catalogue or other owners' files. This claim excludes Quiet Partner, E1 and the
other R batches.

Acceptance: independently derive carrier/motor, planet/carrier and rack-feed
laws from actual parts; preserve all existing gates and inputs; require a
buildable layout, solid/connected checks and real source-bound VM/Jolt and
browser control/save-reopen observations before promotion. Retain failures and
existing originals, use no invented physical accuracy or hardware claims, and
complete all enabled checks before a normal matched-head merge.

Static candidate checkpoint: `scripts/audit-spiral-racks.mjs` screens the
catalogued rack-tooth connectors against the four existing attachment points,
using all axis-aligned proper rotations and a rigid translation. In the current
catalogue only the existing 64781 satisfies all fixed attachments and the
reference tooth-contact geometry. When mount positions may change, 32132,
32185 and 18942 retain the reference tooth span/contact in this screen but lack
one or more compatible existing mount types or locations. Nearest connector
distances are independent per mount and do not establish a jointly buildable
assembly. This is not a tooth-pitch, real-geometry, collision, travel or
physical-build result; promotion remains pending.
