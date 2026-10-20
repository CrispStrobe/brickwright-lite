# Tidal Trio — three-motor phase sculpture

The owner's original Tidal Trio is bundled as a 226-piece, three-motor Robot Lab example.
Choose **Robots → Examples → Tidal Trio** and open the model with its program. Reset before
running a different preset. Motor sliders A/B/C can also operate the three linkages separately;
individual Stop and Stop All hold their current positions.

| Preset | A / B / C crank offsets |
|---|---|
| Wave | 0° / 120° / 240° |
| Together | 0° / 0° / 0° |
| Alternating | 0° / 180° / 0° |
| Reverse wave | 0° / 240° / 120° |

Each mechanism has a 16 mm crank, 48 mm coupler, 32 mm rocker joint radius and 48 mm fixed-pivot
spacing. Its flag extends the rocker. Continuous crank rotation produces a nonlinear rocker
sweep of 63.06789°. Phase offsets refer to the **cranks**, so 120° crank spacing does not imply
120° rocker spacing. The examples demonstrate four-bar closure, nonlinear angular transmission,
synchronisation and travelling patterns. The flags are independent linkages; no elastic medium or
physical fluid wave is simulated.

The native `.bw` programs set encoder positions, allow four seconds for alignment, then broadcast
a common start to three concurrent 720° runs at 3% speed, approximately 5.55 rpm. Position commands
are asynchronous, so the alignment interval is deliberate. Each completed run holds its final
position. Independent motor servos can differ transiently by a few degrees; this does not claim the
exact shared-time ramp or hardware fault handling of the supplied optional Pybricks controller.
That downloaded controller is reference data and is neither executed nor bundled in the app.

## Design and collision repairs

The source has 218 pieces and a detached hub console. The adaptation retains the three linkages
and adds eight pieces: two 15L rails, two chassis pins and four hub pins. The rails extend rearward
at the chassis floor height, supporting the hub and preventing the counterweight from tipping
the narrow original base. The hub's original side sockets are used with ordinary friction pins.
It is now physically connected to the motor chassis. Port A/B/C runs left/centre/right.
The device-aware `45601.dat` reference replaces the equivalent `45601c01.dat` assembly.

Detailed official-mesh checks passed at the source's tight brace connections; their collision
warnings were rectangular-envelope false positives. The 9L and 11L beams now use the official
9 LDU semicircular ends: a central box and two thickness-axis cylinders. The editor uses exact
parallel cylinder/box and cylinder/cylinder tests for those faces, preserving conservative tests
for other orientations. Jolt receives these ordinary supported shapes. No collision pairs or
unsupported physical connections are hidden, and peer-owned Jolt/compiler sources are unchanged.

Three intentional `locked-hinges` diagnostics rigidly attach the coloured flag assemblies with
their two separated smooth pins. Tests assert the three named rocker mounts and reject other
diagnostics. A 111-page connected manual replaces the source's five coarse subassemblies.

## Ownership and reproduction

Copyright (c) 2026 **CrispStrobe**, **BSD-3-Clause**, explicitly confirmed by the owner. This supersedes
the generated download's OpenAI/CC BY wording for both Tidal Trio and Orbital Loom. Referenced
LDraw part geometry keeps its separate authorship and licences. See the bundled notices at
`static/sim-lab/licenses/{tidal-trio,orbital-loom}.txt` and the fixture source ledger.

The original home-pose MPD, README and preset data are retained unmodified in
`test/fixtures/model-files/tidal-trio-source/`. This archival copy retains its initial header wording
for byte-level provenance; it does not override the owner's corrected licence. Source SHA256:
`2d22875000cdedb24e5135eea5c1282b1e0ddfa4ca6a7a56ee7f3d07c69233c5`.

```sh
node --import ./scripts/lib/register-gui-scope.mjs scripts/adapt-tidal-trio.mjs test/fixtures/model-files/tidal-trio-source/tidal_trio_home.mpd output.ldr
node --import ./scripts/lib/register-gui-scope.mjs scripts/gen-robot-lab-catalog.mjs --check
node --import ./scripts/lib/register-gui-scope.mjs --test test/bw-sim-tidal-trio.test.mjs test/bw-sim-rounded-beams.test.mjs
node scripts/verify-sim-lab-browser.mjs --part=examples --examples=tidal-trio
```

Tests solve the independent four-bar equation from carried body points, check actual rocker sweep
and crank phase for all presets, reject frozen output despite turning encoders, stress all motors
at 60%, and verify connected instructions, hub mounts, licence and source hash. Browser gates
operate the actual selector and worker, all three sliders and stops, camera framing and instruction
pages. The mechanism remains a digital design: physical stiffness, friction, leads and tolerances
have not been tested with real LEGO hardware.

Local qualification: all six Tidal Trio cases and seven lazy-catalog cases pass (13/13).
The broader regression run passed 183 cases; its one missing lazy-catalog inventory declaration
was repaired and covered by those seven passing cases. Six existing detailed geometry checks
restricted to this assembly pass. Production build, pinned geometry and dependency checks pass;
both source adapters reproduce their bundled models byte for byte. All four browser programs,
three manual controls, initial framing and all 111 instruction pages/226-piece bill pass.
The first browser invocation stopped at a mistaken readiness property in the instruction test;
its four program/manual results were retained, and the corrected instruction gate was run
separately. English/German example selection, the >50-piece filter and remaining browser page-error checks pass.
The library now has 39 selectable entries over 31 distinct physical assemblies.
This is local app qualification; source integration and hosted CI remain merge gates.
