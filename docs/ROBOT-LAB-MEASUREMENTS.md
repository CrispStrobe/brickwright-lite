# Live measurements in the Robot Lab

In **Simulate → Show → Measurements**, add measurements, choose their targets,
and enable **Show in model** to draw live labels, connecting lines and vectors.
Each measurement can be hidden or removed independently. **Reset to recommended
measurements** restores structural presets: an assembly's mass and speed,
motor angles, slider travel, and rope or wheel loads where the model supports
them. A lift therefore offers travel; a wheeled robot offers a wheel load.

Custom measurements support:

| Quantity | Target and units | Meaning |
| --- | --- | --- |
| Mass | One part, g | Configured mass of its rigid assembly, including joined parts |
| Weight | One part, N | That configured mass multiplied by scene gravity |
| Speed | One part, m/s | Jolt linear velocity at the assembly's centre of mass |
| Angular speed | One part, degrees/s | Magnitude of the assembly's Jolt angular velocity |
| Distance | Two part origins, mm | Current three-dimensional separation |
| Angle | Three part origins, degrees | A–B–C, with B as the vertex; range 0–180° |
| Joint angle / angular speed | Hinge, degrees or degrees/s | Signed relative, unwrapped hinge coordinate or rate |
| Slider travel | Slider, mm | Signed displacement from the joint's initial coordinate |
| Rope tension | Rope, N | Existing rope constraint impulse divided by its fixed timestep |
| Wheel normal load | Part of a rolling wheel, N | Existing rolling model's estimate from vertical acceleration and joint impulses |

The panel identifies the source of each reading. Unsupported wheel diagnostics,
missing targets and degenerate angles display **Unavailable**, never an invented
zero. Selecting a motor part refers to one of its compiled rigid assemblies;
select a joined axle, wheel or housing part to disambiguate which assembly.
These are simulation observations, not hardware measurements or accuracy claims.
Configured mass can differ from solver mass adjustments; weight is explicitly
calculated from configured mass. No total contact-force or motor-torque reading
is inferred from these quantities.

Vectors use diagram scales: velocity multiplied by 0.1 seconds, and forces at
20 mm per newton. Labels carry the actual values and units. These scales affect
only drawing. Distance lines and angle legs join the measured part origins.

Definitions and individual visibility save with the model in the project's
`.sb3` bundle. They survive Reset and Build/Simulate transitions. Switching
examples keeps each model's definitions during the current pane session.
Standalone LDraw exports carry the model geometry; use a project save to retain
measurement definitions. Recompilation checks joint/rope bindings and reports
missing targets rather than silently attaching to a reused generated id.

Pause retains readings. Pose replay hides live readings and overlays until the
view returns to the current simulation. Measurements never drive the model or
change physics state, timesteps, solver settings or dependency versions.

The implementation observes the existing Jolt simulation. No additional
mechanism solver or third-party teaching library is required.
