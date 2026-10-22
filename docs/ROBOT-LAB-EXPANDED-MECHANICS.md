# More motorised mechanics examples

The revision 6 mechanics catalogue contains 330 ideas in 29 categories, including 234 additions
to the first 96-idea list. It distinguishes direct mechanisms from external-material experiments
and analogies. This batch selects independently controllable mechanisms that the simulator can
measure directly; it does not claim to implement all 330 ideas.

Open **Robots → Examples**, search the name, and choose **Open model + program**. Reset before
repeating. Each motor also has its own slider and Stop button in **Motors**.

| Example | Pieces | Motors | Experiment |
|---|---:|---|---|
| Two-joint positioning arm | 29 | A shoulder, B elbow | Position an 80 mm / 64 mm serial arm; compare different elbow branches at nearly the same tip position. |
| Three-drive ratio workbench | 66 | A, B, C | Compare 24:24:24 idlers, 8:24 × 8:40 compound reduction, and five 8:24 stages. |
| Rack shuttle table | 27 | A | Translate a guided table 50.27 mm and return, using an 8-tooth pinion. |

All counts include hub, motors and every fastener. These original designs and programs are
BSD-3-Clause. No external CAD is copied. The larger workbench uses its pieces for three complete
transmissions and a shared pinned bed, rather than adding unrelated ballast.

The arm implements the catalogue's `planar_two_revolute_arm` idea. Its tip follows
`x = 80 cos(a) + 64 cos(a+b)`, `y = 80 sin(a) + 64 sin(a+b)` in millimetres in the motion plane.
The two motors sit at different heights; the fixed height offset is included in the 3D judge.
The ideal radial workspace is 16–144 mm before collisions and joint restrictions. The example
visits elbow angles ±60° and shoulder angles around −45° and +53°. A=0°/B=60° and
A≈52.659°/B=−60° describe the same ideal point. The controller uses the nearest whole shoulder
degree (53°), and the measured postures must agree within 2 mm, including motor encoder resolution
and settling. The measured trajectory is separately checked against forward kinematics to 0.5 mm.
It is an unloaded pointer arm; it has no pen contact, independent tool orientation or payload rating.

The workbench addresses `compound_gear_train` and `remote_transmission_architecture_bench`.
A completes one input turn and one output turn in the same direction; B completes five input turns
and one-third of an output turn; C completes ten input turns and −10/243 of an output turn.
Ratios are +1, +1/15 and −1/243. The program reverses each drive and returns home. Tests compare
both endpoints and the whole output-angle trajectory. This demonstrates kinematic multiplication
and direction; it does not measure transmission efficiency or claim that gearing creates power.

The shuttle implements `rack_and_pinion`, with a horizontal guided carriage and a pinned spread
base. The pinion pitch radius is `8 × 1 mm / 2 = 4 mm`, giving `s = 4 mm × angle in radians`.
The program turns two revolutions forward and back. A sustained powered overrun must stall at
the guide's physical travel stop. This is a machine-table module; it has no presence sensor or
automatic-door state machine.

Initial motor stress tipped the arm and shuttle; spread bases corrected the designs. Detailed
geometry checks also found opposing short pins occupying the same bores. The workbench bed now
uses separate mounting holes, and the shuttle uses one 3L pin through each three-layer mounting
stack. Six existing mesh/fastener/shared-hole geometry assertions restricted to these three
models pass, in addition to collider and connectivity checks.

`scripts/gen-mechanics-expanded.mjs` regenerates all three assemblies and refuses disconnected
parts or collider overlaps. All three app registries and the bilingual example catalogue include
them. Programs and models ship offline. Test judges use actual Jolt poses and output hinges,
not prescribed animations. Frozen arm and shuttle output controls must fail.

```sh
node --import ./scripts/lib/register-gui-scope.mjs scripts/gen-mechanics-expanded.mjs
node --import ./scripts/lib/register-gui-scope.mjs scripts/gen-robot-lab-catalog.mjs
node --import ./scripts/lib/register-gui-scope.mjs --test test/bw-sim-expanded-machines.test.mjs test/bw-sim-example-catalog.test.mjs
node scripts/verify-sim-lab-browser.mjs --part=examples --examples=expanded-machines,expanded-manual
```

The browser gate opens models and programs through visible Examples controls, runs them in the
actual physics worker, checks the same equations, and separately operates every manual motor
slider. It checks initial framing, individual Stop and Stop all. Simulator qualification does
not establish physical LEGO construction or hardware accuracy.

Local qualification: all three programs passed in the real physics worker, all six manual motor
controls passed with Stop checks, and each complete model fitted the initial camera view. The
shared focused regression set (including the later loom support) passed 231 tests.
