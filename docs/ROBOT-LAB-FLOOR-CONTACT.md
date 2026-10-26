# Driven linkage floor contact

Issue #1436 reports that the collapsed single-chain Sarrus, driven with the
intact model's original program, crosses the thin generated floor and then
falls freely. The shipped observe-only control avoids driving the collapse;
it does not correct collision handling.

The candidate changes only the compiler-generated, level, 20 m square ground
collider. Its top remains at the original height, with the same friction and
restitution, but Jolt represents the ground as a plane with a solid negative
half-space. Authored platforms retain their box colliders. Complex bodies keep
the existing continuous-sweep cutoff; solver settings, timesteps, motors,
model geometry and programs are unchanged.

This is a candidate pending actual hosted qualification. A source check or a
finite pose alone does not qualify ground contact. The fixture manifest binds
the served models, original drive, observe-only program, licences and exact
engine pin. Separate processes load the byte-exact retained old core and current candidate
at the original module URL (preserving relative imports), without
overwriting source files. The old kernel must reproduce floor escape; the
candidate must prevent any dynamic body from passing entirely below the old
slab during every observed fixed step. Bounds are conservative transformed
collider AABBs, not corrected or clamped engine poses. The intact Sarrus keeps
its existing travel, axis, phase and completion assertions. The held control
also runs at requested cold starts of 0, 275 and 1000 ms through the unchanged
direct-VM helper. Its existing frame clock quantizes cold-start timing.

A separate nine-collider downward drop isolates the discrete complex-body floor
interaction from the linkage. The old slab must lose it; the candidate must
recover within the predeclared 20 fixed steps and remain inside the footprint.
This deliberately fast diagnostic has a different recovery bound from the
Sarrus, for which every fully escaped step is forbidden.

The full original drive is also applied to the single-chain model. A blocked
drive can time out or stop early; its completion state is reported separately
from the floor-safety observation. No timeout is relabelled program success.
The driven safety horizon is at least 30 simulated seconds. Original failures
must remain visible and no acceptance thresholds may be weakened after a run.

The Sarrus test entry invokes the fixture qualifier using its existing GUI
dependency declaration. `test/bw-sim-floor-contact.test.mjs` checks source
identities and geometry calculations without loading the engine. Hosted TAP
diagnostics retain the fixed-step scalar series. The standalone
`node scripts/verify-sim-floor-contact.mjs <retained-tap-file>` reader checks
case identities, sequence completeness and floor-escape counts without
importing the producer or replaying a guest. It audits the retained scalar
series, not an independently reconstructed full pose trajectory.

Jolt's plane is mathematically infinite, but its broad-phase extent is bounded.
The cases qualify contact only within the original floor footprint. Plane
edges and a deliberate drive off the finite mat are not qualified as equivalent
to the former box. See the [Jolt PlaneShape documentation](https://jrouwe.github.io/JoltPhysics/class_plane_shape.html).
This change makes no calibration, hardware, general solver-stability or
physical-accuracy claim. Issue #1435's separate resting-frame creep remains
outside this lane. If the driven linkage still loses contact, retain that
failure and investigate solver/contact behavior before proposing another fix.
