# Resting-frame creep inputs (issue #1435)

`obliquity-orrery-raised.ldr` is the byte-identical Obliquity Orrery served at
`7b4f2f84ac55e238bbb75663acbdc1e26f3d0358`, with its shipped mitigation
(`base_rail_0` raised 1 LDU). `obliquity-orrery-coplanar.ldr` changes only that
one coordinate back to `200`, the reported coplanar stance; the test proves all
other lines agree. It is a test-only reconstruction, not the reporter's
unavailable stripped model. `driving-base.ldr` and `gearbox.ldr` are the served
reference models at the same commit (CRLF preserved), chosen as two ordinary
standing controls; they are not the issue's unnamed sixteen-model census.

Each case prepares the model with the existing plain-mat convention and runs
200 Hz fixed steps for 350 steps (1.75 s), recording the initial row and every
completed step with no settling interval. No motor command is issued, so every
hinge stays in the core's default coast mode; no pose, material, geometry or
runtime default is changed. The isolated-frame cases keep the compiled ground
and frame body objects exactly and remove every other body, joint, actuator,
hub, coupling, device and collision relation explicitly, listing each removal.

Rows hold the subject's native position, quaternion, linear and angular
velocity, core time and a ground body-pair contact flag (not manifold points).
`scripts/verify-sim-resting-creep.mjs` reads retained `CREEP1435_RESULT`
diagnostics without importing the producer or starting the engine, checks the
step census, clock, quaternions and identities, and recomputes the summary.
A pass is data integrity only. Drift values are reported, never judged against
an invented tolerance; the issue's approximate drift is comparison data.

Real engine cases run in hosted CI. The Orrery licence is retained beside the
inputs; the reference models are project files under the repository licence.
No physical-accuracy, general-stability or solver-correction claim follows.
