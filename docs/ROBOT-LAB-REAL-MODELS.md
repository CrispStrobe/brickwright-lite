# Real motorised LEGO models in the Robot Lab (2026-10-20)

51 motorised sets from the LDraw Official Model Repository (an annotated mirror, anteloc/ldraw-lib; every assembly
says `0 !LICENSE Redistributable under CCAL version 2.0`, CC BY 2.0; 55 LDCad-generated sub-files in some of them say
"Free for non-commercial use", so none of those is shipped), each opened in the built app (its unknown parts fetched
from the LDraw mirror and derived), every motor run at 60 % for 2 s of simulated time. Not committed: the files
(only the NXT Tri-bot is a fixture, test/fixtures/model-files). The catalog of sources the owner supplied lists them.

| Model | Family | Outcome | Parts | Motors | Loose groups | Unknown parts |
|---|---|---|---|---|---|---|
| 112-2.mpd | Legacy 4.5V | no motor | 69 | 0 | 13 | 7 |
| 17101-1_Frankie-the-Cat.mpd | BOOST | FAILED: locator.screenshot: Timeout 30000ms exceeded. |  |  |  |  |
| 17101-1_Vernie.mpd | BOOST | FAILED: locator.screenshot: Timeout 30000ms exceeded. |  |  |  |  |
| 21323-1.mpd | Powered Up / Control+ | too slow (33 of 2000 ms simulated in 60 s) | 3371 | 1 | 254 | 290 |
| 31313-1_Spike3r.mpd | Mindstorms EV3 | runs: 2/2 motors turn, moved 0.24 m | 365 | 2 | 16 | 2995 |
| 31313-1_Track3r.mpd | Mindstorms EV3 | too slow (933 of 2000 ms simulated in 60 s) | 160 | 3 | 15 | 4935 |
| 42042-1.mpd | Power Functions | too slow (733 of 2000 ms simulated in 60 s) | 1368 | 1 | 93 | 33 |
| 42042-1_Tower-Crane.mpd | Power Functions | unstable (118 flung, 13 below floor) | 1210 | 1 | 86 | 28 |
| 42043-1.mpd | Power Functions | too slow (67 of 2000 ms simulated in 60 s) | 2709 | 1 | 65 | 810 |
| 42043-1_Flatbed-Trailer.mpd | Power Functions | too slow (300 of 2000 ms simulated in 60 s) | 2629 | 1 | 66 | 1686 |
| 42052-1.mpd | Power Functions | too slow (833 of 2000 ms simulated in 60 s) | 1022 | 1 | 18 | 19 |
| 42054-1.mpd | Power Functions | too slow (367 of 2000 ms simulated in 60 s) | 1951 | 1 | 43 | 27 |
| 42055-1.mpd | Power Functions | too slow (200 of 2000 ms simulated in 60 s) | 3699 | 1 | 339 | 141 |
| 42065-1.mpd | Power Functions | runs: 2/2 motors turn, moved 0.00 m | 351 | 2 | 3 | 14 |
| 42066-1.mpd | Power Functions | too slow (967 of 2000 ms simulated in 60 s) | 1133 | 1 | 21 | 14 |
| 42070-1.mpd | Power Functions | FAILED: locator.screenshot: Timeout 23581.331999999937ms exceeded. |  |  |  |  |
| 42080-1.mpd | Power Functions | too slow (767 of 2000 ms simulated in 60 s) | 940 | 1 | 40 | 104 |
| 42082-1.mpd | Power Functions | too slow (300 of 2000 ms simulated in 60 s) | 3955 | 1 | 134 | 184 |
| 42095-1.mpd | Power Functions | runs: 1/2 motors turn, moved 0.01 m | 302 | 2 | 70 | 28 |
| 42099-1.mpd | Powered Up / Control+ | too slow (767 of 2000 ms simulated in 60 s) | 893 | 3 | 51 | 56 |
| 42100-1.mpd | Powered Up / Control+ | FAILED: locator.screenshot: Timeout 30000ms exceeded. |  |  |  |  |
| 42109-1.mpd | Powered Up / Control+ | unstable (1 flung, 1 below floor) | 436 | 2 | 7 | 25 |
| 42113-1.mpd | Powered Up / Control+ | too slow (633 of 2000 ms simulated in 60 s) | 1613 | 1 | 33 | 543 |
| 42114-1.mpd | Powered Up / Control+ | FAILED: locator.screenshot: Timeout 22052.986000000034ms exceeded. |  |  |  |  |
| 42124-1.mpd | Powered Up / Control+ | unstable (21 flung, 0 below floor) | 347 | 2 | 15 | 22 |
| 42129-1.mpd | Powered Up / Control+ | too slow (200 of 2000 ms simulated in 60 s) | 2016 | 4 | 83 | 125 |
| 42131-1.mpd | Powered Up / Control+ | too slow (167 of 2000 ms simulated in 60 s) | 3656 | 2 | 80 | 2835 |
| 45300-1_Milo-with-tilt-sensor.mpd | WeDo 2.0 | BLEW UP (NaN) | 62 | 1 | 10 | 8 |
| 4558-1.mpd | Legacy 9V trains | no motor | 59 | 0 | 8 | 12 |
| 4558-1_B-Model-from-Instruction.mpd | Legacy 9V trains | no motor | 57 | 0 | 11 | 16 |
| 4563-1.mpd | Legacy 9V trains | no motor | 346 | 0 | 83 | 61 |
| 4565-1.mpd | Legacy 9V trains | too slow (1967 of 2000 ms simulated in 60 s) | 789 | 0 | 114 | 126 |
| 51515-1_Blast.mpd | Robot Inventor | too slow (700 of 2000 ms simulated in 60 s) | 463 | 4 | 22 | 5437 |
| 6990-1.mpd | Legacy 9V monorail | no motor | 676 | 0 | 184 | 168 |
| 75253-1.mpd | BOOST | FAILED: locator.screenshot: Timeout 30000ms exceeded. |  |  |  |  |
| 7722-1_Combination-with-7865.mpd | Legacy 12V trains | no motor | 373 | 0 | 79 | 138 |
| 7725-1.mpd | Legacy 12V trains | no motor | 330 | 0 | 11 | 54 |
| 7730-1.mpd | Legacy 12V trains | no motor | 361 | 0 | 73 | 16 |
| 7740-1.mpd | Legacy 12V trains | no motor | 563 | 0 | 56 | 120 |
| 7745-1.mpd | Legacy 12V trains | no motor | 522 | 0 | 65 | 94 |
| 8054-1_Model-A.mpd | Legacy 4.5V | no motor | 74 | 0 | 10 | 14 |
| 8054-1_Model-C.mpd | Legacy 4.5V | no motor | 145 | 0 | 5 | 11 |
| 8054-1_Model-D.mpd | Legacy 4.5V | no motor | 149 | 0 | 5 | 14 |
| 8110-1.mpd | Power Functions | too slow (367 of 2000 ms simulated in 60 s) | 1848 | 1 | 118 | 257 |
| 8258-1.mpd | Power Functions | too slow (733 of 2000 ms simulated in 60 s) | 1628 | 1 | 44 | 36 |
| 8275-1.mpd | Power Functions | too slow (567 of 2000 ms simulated in 60 s) | 1361 | 4 | 29 | 37 |
| 8527-1_Basket-Tri-bot.mpd | Mindstorms NXT | runs: 0/3 motors turn, moved 0.00 m | 176 | 3 | 0 | 3 |
| 8527-1_QuickDraw-Tri-bot.mpd | Mindstorms NXT | runs: 1/3 motors turn, moved 0.08 m | 178 | 3 | 0 | 1 |
| 8527-1_Tri-bot.mpd | Mindstorms NXT | runs: 3/3 motors turn, moved 0.19 m | 229 | 3 | 3 | 1 |
| 8527-1_Whacker-Tri-bot.mpd | Mindstorms NXT | runs: 2/2 motors turn, moved 0.27 m | 164 | 2 | 1 | 3 |
| 9397-1_Snowplow.mpd | Power Functions | too slow (833 of 2000 ms simulated in 60 s) | 1127 | 1 | 45 | 130 |

## What the numbers say

- **Too slow (21):** a big Technic set is 140–200 bodies with ~1000 colliders. In a headless profile of 42099 / 42052
  a 5 ms step costs 40–85 ms (6–10 % of real time): most of it is Jolt's narrow phase in WASM; about a quarter is
  the JavaScript sim-shape filter (jolt-core.js simShapeFilter) Jolt calls back for every sub-shape pair. Filtering
  the body pairs that touch as built (beyond the joined ones) gains only 1.4–1.7×. Options, all owner decisions: a
  native part-pair filter in the Jolt fork (a WASM rebuild), body-level filtering for large models, fewer colliders
  per derived part, or a reduced-detail mode for large models (simplified colliders, sleeping bodies).
- **No motor (13):** legacy 4.5 V / 9 V / 12 V train motors, the monorail and the 4.5 V Technic motor (6216m, an
  obsolete alias file): train motors are bogies with their wheels built in; trains need rails. Not modelled yet.
- **Page hung (6):** the BOOST sets (75253, Frankie, Vernie) and three of the largest (42070, 42100, 42114): the
  screenshot after loading timed out, the page busy (to investigate with the speed work).
- **Unstable (3) / NaN (1):** the Tower Crane flings 118 bodies; the WeDo Milo blows up — to investigate.
- **Runs (7):** the four NXT Tri-bot variants, Spike3r, the PF racers (some motors stall against loose parts).

## Speed: what it was (2026-10-20, later the same day)

The narrow phase was not the cause. A/B on the headless bench (CPU time per 5 ms step, every motor at 60 %, the
release build; `createPhysicsCore(..., {experiments})` holds the switches):

| Model | before | sleeping | contact cache | 4 velocity / 1 position steps | no shape filter | Discrete for bodies of > 8 colliders |
|---|---|---|---|---|---|---|
| 42099 4x4 Off-Roader | 280–600 ms | same | same | same | 127 ms, 67 bodies flung | **10–15 ms**, nothing flung |
| 8275 Bulldozer | 90–165 ms | same | slower | slower, 92 flung | 140 ms, 91 flung | **22–32 ms**, nothing flung |
| 42052 Heavy Lift Helicopter | 250–530 ms | | | | | **15–21 ms** |

Every moving body was continuous-collision swept (`EMotionQuality_LinearCast`). Jolt sweeps a body that moves more
than a quarter of its inner radius in a step, and a compound's inner radius is its thinnest sub-shape, so a
500-part frame was swept against everything near it nearly every step. Bodies of more than `CCD_MAX_COLLIDERS` (8)
colliders are now Discrete; single parts keep the sweep that stops a dropped brick passing through a beam. Timings
range because other agents loaded the machine (load average 15–25); each row's columns ran interleaved in one
process.

Also found with Jolt's debug build: the core destroyed two of the bindings' static temporaries (the compound
`ShapeResult`, and `GetSurfaceNormal`'s `Vec3` under every sensor-ray hit). The release build went on with a
damaged heap. Both are fixed, and `test/bw-sim-jolt-debug-build.test.mjs` runs bundled models on the debug build.

Not shipped yet: merging a big body's boxes into fewer (a voxel merge, 676 → 567 boxes on the 4x4, 786 → 251 on
42052). It flings bodies on two of three models, so it needs more work.

## Holding together: aliases, embedded copies, near-misses, nesting (2026-10-20)

On the 4x4 Off-Roader (42099), 56 unknown parts and 51 loose groups were down to four causes, none of them the model:

1. **Alias files.** 3023, 32556 and 2654 are `~Moved to 3023b`-style redirects in today's library; 74695 is a `=` alias.
   They derive as their target now: a `~Moved to` or `=` file whose body is one part placed unturned at the origin
   (`part-meta/catalog-parts.js` aliasTarget).
2. **Embedded copies.** An MPD may carry an (unofficial) copy of a part under its own name: `42099 - 52731.dat`.
   `catalogFor` derives the library part it names, and `knownAs` maps the copy to it.
3. **Near-misses** (`mech/loose-rescue.js`, models from elsewhere only). A group connected inside but to nothing
   else is joined by its nearest pin- or axle-in-hole near-miss: about 2°, 4 LDU across, 1 LDU engaged, blind
   bottoms ignored. The turntable 18938/18939's holes derive as blind, and 268 parts hung on one 3L axle-pin
   through it. Warning `seated-loosely`.
4. **Nesting** (`mech/collision-filter.js` asBuiltOverlaps, models from elsewhere only). Two parts of different
   bodies whose colliders overlap by more than 0.5 mm as built never collide with each other. A CV joint's ball
   sits in its solid-filled cup 8–16 mm deep, and Jolt pushed it out at 7 m/s on the first step.

42099 after these fixes: 0 unknown and 18 small loose groups (from 51). Over 1 s with every motor at 60 %, nothing is
flung, all three motors turn, and it runs at 13 ms per 5 ms step (headless, CPU). Our own files
(`0 Author: Brickwright`) get neither 3 nor 4: there a loose or overlapping part is the builder's to fix.
5. **Obsolete pieces.** `~… (Obsolete)` files are real pieces a newer one replaced (minifig hips 3815, the 1x2x5
   brick 2454, the 4.5 V Technic motor 6216m), so they derive like any part. Other `~` files are pieces of a part
   (a cable's or hose's segment, a shock absorber's rod) and stay drawings. Across the 148 models, the
   most-refused files were 3660 (inverted slope, 22 models), the minifig hips and legs (15) and 61409 (12).

## Speed in the app, and multithreading (2026-10-20, measured)

- **Rendering is not the bottleneck.** With the GPU (headless Chromium, ANGLE on Metal), the 4x4 Off-Roader's 949 parts
  draw at 60 fps. With SwiftShader, which the CI gates use, 0–1 fps: frame rates from the gates say nothing.
- **The physics worker is.** The 4x4 costs about 20–30 ms of worker time a step in the browser, against 5–9 ms on the
  bare core in node, and almost all of it is inside Jolt's `Step`. Node's session path costs 12–18 ms: the hub bridge and
  the worker protocol add little, the rest is the browser. On this shared machine (load average 6–17) every number
  varies by about 2×.
- **Jolt's multithreaded build** (cross-origin isolated pages only, COOP + COEP) fails as long as the part-pair filter
  is JavaScript: Jolt calls `SimShapeFilterJS` from its worker threads, where the JS object does not exist. With the
  filter off on both sides (a fair comparison; physically wrong), threads make the step 2.2× faster on 42099 (80 → 37 ms)
  and 1.45× on 42055 (85 → 60 ms). Prerequisites: (1) the part-pair filter in C++ in the Jolt fork, which on its own
  saves the 5–12 % the JS callback costs; (2) cross-origin isolation from the host (the desktop app can set it; for the
  website it is a deployment decision); (3) the multithreaded build served unbundled, since webpack's runtime breaks its
  pthread workers.
- **Loading a big set takes 10–26 s** in the app: the library's parts are fetched and derived in the browser on first
  use. That is next.
