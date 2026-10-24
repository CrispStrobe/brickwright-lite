# Watt's Line: acceptance record

The **normal ±20° native experiment passes** its predeclared contract. A separate
forced-stop stress test **fails** its original maximum encoder-angle bound.
These are different claims, reported independently. Physical hardware and
interactive browser behavior remain untested.

## Status by layer

| Layer | Status | Evidence and scope |
| --- | --- | --- |
| Export | **PASS** | 145 explicit placements; 10 part IDs; 14 part/colour rows; one hub, one motor A; 8 connected instruction stages; proper rotations and unique IDs. Final bytes are recorded in `SHA256SUMS`. |
| Construction | **PASS, stated digital checks** | Six baseline solid/mesh/fastener tests pass at unchanged tolerances. Two separate 501-pose analytical sweeps cover the nominal stops and the extended ±26.5° stress envelope; no unintended moving-bar overlaps. Retention, shared shafts, stator and hub mounts reviewed. |
| Native working sector | **PASS** | Exact exported LDR/BW execute through registered compiler, Scratch VM, extension, controller and Jolt. Both ordinary and autoPorts:false runs pass unchanged acceptance limits. |
| Measurement negative control | **PASS** | The same trajectory judge rejects a frozen measured coupler. Actual-body observations are independent of the analytical prediction. |
| Forced-stop numerical limit | **FAIL** | Original accepted magnitude 23.5° to 26°. Measured peaks +25.8866° / −26.3658°; the negative peak exceeds 26° by 0.3658°. The failed bound is retained. |
| Stop contact causality | **PASS, separate observation** | Removing only two orange rails and their four pins increases the excursion. This establishes the rails' effect; it does not make the failed ±26° stress criterion pass. |
| Catalog / build | **PASS, local integration** | One entry added, all 80 previous entries preserved. 23/23 focused tests pass; production webpack build passes. Built model/program/lesson/license bytes match the package. |
| Browser UI | **UNTESTED** | Chromium and headless-shell downloads returned invalid/empty ZIPs. No gallery, import, Blocks, control, lesson, instruction or BOM UI pass is claimed. |
| Physical assembly | **UNTESTED** | No physical LEGO build, cable sweep, hardware program, friction/tolerance or durability measurement. |
| Remote delivery | **NOT PERFORMED** | No CI, remote merge, pull request, deployment or published application release. |

## Native observations

The final native run used 60 Hz observations, 2 seconds unpowered startup,
1 second after completion and a 45-second host limit. Both import modes returned
the same 1,147 measured frames, 965 during the program, with completed=1,
failed=0 and stage=7. Program duration was 16.083 seconds.

| Measured quantity | Result | Contract |
| --- | ---: | ---: |
| Longitudinal midpoint travel | 27.5431 mm | 26–29 mm |
| Maximum lateral departure from x=40 mm | 0.09535 mm | <0.35 mm |
| Maximum independent prediction error | 0.06584 mm | <0.5 mm |
| Maximum hinge-point gap | 0.05503 mm | <0.5 mm |
| Maximum hinge-axis mismatch | 0.16153° | <2° |
| Maximum chassis tilt | 0.00136° | <0.3° |
| Passive drift after first 200 ms | 0 at recorded precision | <0.15 mm |
| Midpoint return error | 0.14608 mm | <0.8 mm |
| Final encoder A | −0.20917° | Within 1° of zero |
| Worst settled stage endpoint error | 0.42084° | Within 1° |

All four bodies remain dynamic; the chassis is not frozen. Four actual hinge
constraints remain, with no ball-joint loop replacement, gear coupling, invisible
guide, virtual payload, auto-wiring or loose-part rescue. The baseline's local
part collision filter explicitly enables input/stop-rail contacts. Coupler/rail
surface contact remains enabled. The same native program includes no model-load
or reset calls; the test host lacks those callbacks, so a saved-datum guard is
used instead.

## Failures and limitations retained

The development program failed its stage-2 reversal. Removing two immediate
active-hold commands between bounded moves resolved the controller transient;
intermediate moves now finish with native brake behavior. The final revised
program was rerun in full. Arrival bounds were not relaxed and runtime source
was not repaired. See `evidence/control-development.md`.

The separate deliberate stop probe applies sustained motor drive beyond the
working sector. Its ±26° encoder bound failed. Independent pose analysis shows
shaft and fixed-origin endpoint angles diverging under load, along with larger
joint gaps; this is consistent with compliance in the constraint solver. The
nominal ±24.835° geometric contact calculation is not a rigid encoder ceiling.
See `evidence/physical-stops.md` and its raw measurements. **The stricter stop
claim remains failed; do not increase the ±20° operating range.**

Analytical clearance and catalog-mass stability estimates are construction
evidence, not measured physics. The 313.35 g catalog estimate omits separately
modeled battery/cable mass; minimum estimated inset-footprint margin is 59.15 mm.
Exact saved-pose mesh renderings are illustrations, not photographs or app UI
screenshots. Native precision does not establish physical LEGO accuracy.

## Reproduce and audit

`evidence/REPRODUCE.md` gives exact commands and working directories.
`source/qualify.mjs` produces the main native result; `source/check_stops.mjs`
records both stress runs and exits nonzero for the retained bound failure.
`evidence/qualification.json`, `evidence/physical-stops.json`,
`evidence/integration.json`, raw traces and test logs provide machine-readable
evidence. The source and runtime identity are pinned in `SOURCES.md` and
`evidence/runtime-identity.json`.

Model SHA-256:
`42ac6e7819b0cfb103c5a94690f04b9a2b24bca904c4e09144918c46b19476df`.

Program SHA-256:
`82f06bf83ddd8a32eb6333daf14eb4f66b70de15fc59555c665da6c8b3fefbb0`.

The final archive is checked for CRC errors and byte identity against every
packaged file; the model/program hashes must match these tested identities.
