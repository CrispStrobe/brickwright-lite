# Live measurements in the Robot Lab

In **Simulate → Show → Measurements**, add measurements, choose their targets,
and enable **Show in model** to draw live labels, connecting lines and vectors.
Joint choices identify the connected assembly parts (and the hub when present).
The panel also shows each saved measurement's targets. Each measurement can be hidden or removed independently. **Reset to recommended
measurements** restores structural presets: an assembly's mass and speed,
motor angles, slider travel, and rope or wheel loads where the model supports
them. A lift therefore offers travel; a wheeled robot offers a wheel load.

Custom measurements support:

| Quantity | Target and units | Meaning |
| --- | --- | --- |
| Model mass | No part target, g | Configured masses of all simulated model assemblies, including clamped pieces; excludes the ground, mat and scenery |
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
Use **Edit** beside a saved measurement to change its name, quantity or targets
without removing it. **Save changes** replaces that definition in place, keeping
its order, visibility and plot selection; **Cancel** discards the draft. Editing
remains available when all 64 definition slots are occupied. If its model or
saved definition changes while the editor is open, the stale draft is refused.
For joint and rope readings, the editor asks for an explicit selection when the
saved binding no longer matches the current mechanism; saving refreshes the
binding to that selected joint or rope.

Pause refreshes the final readings, including a short worker update after the last regular sample. Running readings remain sampled every 100 ms of simulated time. Pose replay hides live readings and overlays until the
view returns to the current simulation. Measurements never drive the model or
change physics state, timesteps, solver settings or dependency versions.

The implementation observes the existing Jolt simulation. No additional
mechanism solver or third-party teaching library is required.


Model mass counts physical assemblies once, including both mass shares of a
split motor. Drawn-only decoration without a physical body contributes no mass.
The total is configured simulation mass, distinct from any solver mass floor.

Large assemblies use compact target identities without increasing the saved
field-size limit. Existing project files with the earlier joint or rope identity
format remain readable; changing the target assembly still makes a reading
unavailable rather than silently selecting a different target.


Each reading has a **Time plot** checkbox. Choose up to four plots to compare
values over simulated time. A plot keeps at most 128 samples over the latest
12.8 simulated seconds, with one regular sample every 100 simulated milliseconds.
Pause refreshes the final point. The horizontal axis starts at the first retained
sample; the value axis uses the reading's own unit. Current, minimum and maximum
values are also available as text. Missing values leave gaps rather than zeroes.

Plots are temporary observations: hiding or removing a reading stops its trace;
Reset, a different model or a changed target clears its history. Pose replay hides
live plots, and returning live starts a fresh window. Plot choices and samples are
not stored in project files. Saved measurement definitions continue to work as
before. These sampled traces do not establish peak forces or hardware accuracy.

The shipped **Crank and rocker** and **Forklift** examples also offer **Apply lesson
measurements**. The first compares input/output angles and rocker speed; the second
shows input rotation, carriage travel and configured carriage weight. Applying a
lesson set explicitly replaces the current definitions. The targets are checked
against authored parts and current joint bindings; an unsupported or changed
model keeps the existing structural recommendations instead of selecting another
joint. Imported models retain custom measurements and structural recommendations.
