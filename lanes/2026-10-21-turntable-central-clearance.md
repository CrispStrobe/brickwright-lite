# Claim: preserve a turntable's central opening in collision geometry

CLAIMED — owner: Robot Lab model delivery lane. Base: `ecdd6c1ad`.

Counterturn's actual ordinary native program completes but its rotor is braked
against the fixed base. A separate unchanged-model contact diagnostic identifies
rotor/base contacts; the bottom turntable's solid cylindrical collider fills its
real central opening. The older foreign-import path excluded this entire body
pair and concealed the defect. Its broad collision exemption is not a repair.

Scope: turntable collision derivation in
`overlay/scratch-gui/src/lib/bw-sim/part-meta/derive.js`; the affected turntable
entries in `parts.json` and any canonical derived metadata required by repository
checks; the nonmeshing-pair warning proximity test in `mech/gears.js`; focused turntable/geometry and Counterturn regression tests; model-lane
integration and this claim. No Jolt binding, solver, mass-floor, damping, motor,
foreign-import policy, controller or existing tolerance change is included.

Derive bounded compound collision shapes from the official part surfaces while
preserving the central clearance. Check enclosure of those surfaces, a free shaft
through the opening and retained contact with the surrounding ring. Qualify the
actual native reaction against independently measured inertia, preserving the
passive carrier, physical locking control and frozen-output negative. Run the
affected existing turntable/model controls before integrating the new models.
The same model exposes warnings for bevel gears well above the turntable tooth
plane: center distance alone is insufficient. Reject a warning candidate only
when its measured finite tooth envelopes are separated; retain warnings for
actual nearby unsupported meshes. Do not change coupling detection or ratios.
Merge this claim before changing collision derivation or metadata.
