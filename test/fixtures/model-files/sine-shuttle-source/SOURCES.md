# Sources, identities and retained notices

## Original work and related designs

The SineShuttle assembly placements, deterministic builder, finite experiment,
new-model checks, bilingual lessons and reading page are original contributions
credited to **CrispStrobe** under **BSD-3-Clause**. `LICENSE.txt` contains the
complete terms. The bounded-feedback program structure and local schema checker
adapt the earlier original TwinTempo work, also credited to CrispStrobe under
BSD-3-Clause. Their source notices are preserved.

The Scotch yoke is an established mechanism. It is a different inversion of
the broad double-slider chain family used by orthogonal trammels, not a claim
to a newly invented abstract joint graph. This implementation fixes the motor
and crank axis to the chassis, places a captured block across a translating
yoke, and observes the passive yoke and block. No model assets, instructions
or code were copied from DMG-Lib or from unlicensed, closed or noncommercial
mechanism sources.

## Exact supplied collection

Comparison authority: the user-attached
`brickwright-fixed-models-20261023-e6decb090.zip`.

- ZIP SHA-256: `f35fe109a1c013318cfb86c6ccd9e34fee694df7dd2ea1b2c2c6ed63251c3196`.
- Manifest source: `e6decb09005b6eff1eea29695028136408c3cd7c`.
- Manifest SHA-256: `c7f0955aee902da0d943837dda526060fcdb48c93be57765ce534767c0ca07cb`.
- 91 catalog entries, 81 distinct model files and 91 English lessons.

Every catalog entry and every English lesson's observable-output description
and mechanism explanation were reviewed. `evidence/collection-comparison.json`
records exact member hashes, the complete grouped inventory, and focused
comparisons with Quickstroke, Circle Splitter, Crossline, Ellipsa, Ellipse
Engine, Crossglide and Balance Engine. The earlier TwinTempo from this
conversation is compared separately; it is not in that ZIP. The concise
explanation is in `docs/collection-comparison.md`.

The archive is comparison material and is not redistributed inside this add-on.
Its manifest's source revision does not specify a required runtime version.
No chronological or ancestry relation to the selected checkout was inferred.

## Selected application and runtime

Repository: <https://github.com/CrispStrobe/brickwright-lite>

Selected runtime revision:
`e8afd8281647bd5d06d31d9e01885d7d76a85412`.

Permanent source tree:
<https://github.com/CrispStrobe/brickwright-lite/tree/e8afd8281647bd5d06d31d9e01885d7d76a85412>

The selected Brickwright source is BSD-3-Clause, copyright Christian Ströbele
(CrispStrobe) and, where stated, Brickwright contributors. Referenced helpers
retain their existing notices. The full application and its dependency trees
are not included in this package.

| Source path at that revision | Use |
|---|---|
| `README.md`; `docs/ROBOT-LAB-AGENT-HANDOFF.md` | Runtime setup and application integration requirements |
| `overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json` | Supported parts, connector locations, masses and collider metadata |
| `overlay/scratch-gui/src/lib/bw-sim/model/ldraw-model.js` | Native LDraw parsing, stable part IDs and motor ports |
| `overlay/scratch-gui/src/lib/bw-sim/sim-session.js`; `mech/compile.js`, `mech/joints.js`, `mech/loops.js`, `mech/collision-filter.js` and `kinds/slide.js` beneath that simulator directory | Actual body grouping, joints, slider semantics, loop policy and collision filtering |
| `overlay/scratch-gui/src/lib/sb3-creator-register-art.js`; `sb3-creator.js` in the same directory | Registered native `.bw` parser/compiler and SB3 generation |
| `test/helpers/robot-lab-direct-vm.mjs`; `test/helpers/spike-arena-vm.mjs` | Real Scratch VM and native Robot Lab session, with simulated time |
| `scripts/lib/sim-lab-addon-judge.mjs` | Reference method for observing rigid-body poses and part-local markers relative to the actual chassis |
| `overlay/scratch-gui/src/lib/bw-sim/model/lesson-loader.js`; `example-catalog.js` | Native lesson loading and catalog field schemas |
| `overlay/scratch-gui/src/components/tw-pseudocode/sim-lab-toolbar-text.js`; `pseudocode-importer.jsx` | Literal model/code import labels in the selected source |
| `test/bw-sim-quickstroke.test.mjs`; `scripts/lib/sim-lab-quickstroke-judge.mjs` | Previously passed reference baseline, distinct from qualification of SineShuttle |

The prepared runtime was reused after a fresh identity and hash check. Recorded
versions are Node v24.19.0, npm 11.9.0, Scratch VM 4.8.115 and Jolt
1.1.0-bw.6. `evidence/runtime/reuse-check.json` records unchanged source,
locks, installed versions and selected Jolt runtime hash. `prior-*` files are
byte copies of the earlier baseline records and preserve their original
commands and results; they are explicitly not a newly executed baseline run.
No application source, engine, dependency pin or installed runtime was changed.

Scratch VM retains BSD-3-Clause, Jolt retains MIT, and the recorded JSZip build
is used under its MIT option. Other dependencies retain their own licenses;
the application's `THIRD-PARTY-NOTICES.md` governs its complete distribution.
Those dependency trees are external to this standalone model package.

## Standard LDraw geometry and derived illustrations

The `.ldr` references standard parts by filename. Standard `.dat` meshes and
primitives remain external dependencies; the package does not relicense them
under BSD-3-Clause.

LDraw Parts Library: <https://www.ldraw.org/>

Creative Commons Attribution 4.0:
<https://creativecommons.org/licenses/by/4.0/>

Rendered assembly images are adaptations of standard LDraw geometry. Their
corresponding `*.sources.json` manifests identify the model and image hashes,
renderer, pose, camera and each recursively used mesh or primitive, including
its original author, exact license header and SHA-256. These manifests supply
the complete relevant author list and must accompany redistributed images.

The reviewed `visuals/model.sources.json` binds the 105-part saved-pose
illustration to model SHA-256
`926ff367e004a5bfae9173eab354e305d25e62a7f28c7ec1b47d5c766fcff6c2`.
Its recursive closure contains 220 source records: 219 mesh/primitive records
and the LDraw color configuration, with 29 credited author strings and no
missing dependency. `visuals/NOTICE.txt` lists those contributors and the
rendering method. The LDraw-derived visual material in the image is provided
under **CC BY 4.0**, separately from the BSD-licensed assembly and renderer.

The four source part files `2780.dat`, `32278.dat`, `48496.dat` and `6632.dat`
offer CC BY 2.0 and CC BY 4.0; CC BY 4.0 is selected for those contributions.
The remaining 215 mesh/primitive records state CC BY 4.0. Exact source
headers and their attribution are preserved. The selected checkout's
`CAreadme.txt`, `CAlicense.txt` and `CALicense4.txt` remain the external library
license records. `LDConfig.ldr` retains its LDraw.org attribution; its reviewed
header contains no separate license declaration.
Assembly placement, camera projection, lighting and rasterization are the
render transformations. Such images illustrate geometry, not a physical
hardware build or independent physics evidence. `visuals/trajectory.png`
is an original scientific chart under BSD-3-Clause. Its source manifest binds
all 1,395 observed frames to the untouched recording and CSV, the exact model
and program, and the qualification contract and checker. The chart uses the
complete measured yoke trace and residual without smoothing; its smaller
orbit panel identifies the selected second fast turn separately.

`visuals/motion.gif` is a CAD replay of 40 actual recorded body poses from
17.075–20.975 s of that second fast turn. The 4 s loop plays at 10 frames/s,
1× simulation time, with no interpolated or analytically supplied poses.
The native scene builder splits the motor housing and rotor onto their
separate observed bodies. The GIF's source manifest binds the input model,
program, recording, CSV, qualification, renderer and composer, and retains
the recursive LDraw authorship/license records. Its LDraw-derived imagery
is CC BY 4.0; original assembly and rendering code remain BSD-3-Clause.
This animation depicts native simulation, not physical hardware footage.

## Evidence boundaries

Collection comparison establishes distinctness against the supplied files.
Runtime reuse establishes an unchanged, previously checked execution
environment. Native compilation establishes that the exported program parses
and generates an SB3. The final construction and mechanism records separately
establish what was checked on the actual exported assembly and program bytes.
None of these establishes app installation, browser behavior or hardware
performance. The layered qualification summary and `SineShuttle-Validation.md`
preserve those distinctions. The unchanged native contact filters are recorded
explicitly; `evidence/collision-policy.json` adds an independent conservative
bounds review of the two wholly filtered body pairs without altering physics.
