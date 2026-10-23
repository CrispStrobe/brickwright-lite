# Watt’s Line, TwinTempo and classical mechanism search

The model library adds two original CrispStrobe / BSD-3-Clause machines. Both
load their finite example programs automatically and offer bounded motor jogs.

| Machine | Modelled LEGO parts | Drive | Experiment |
| --- | ---: | --- | --- |
| Watt’s Line | 148 | A, one medium angular motor | Watt four-bar linkage; an approximately straight passive midpoint path |
| TwinTempo | 81, plus two cord accessories | A, one medium angular motor | Two equal-radius drums; 8:24:24 gearing gives 3:1 suspended-load travel |

Watt’s supplied 145-piece assembly caught its coupler and a joint pin against a
stop rail during the ordinary sweep in the current runtime. Its repaired assembly
raises the coupler and output bearing one beam layer, uses a real 3L frictionless
pin, and adds a bearing layer with two mounting pins. Two pinned Technic bricks
replace the original stop beams. Planar linkage dimensions, program targets,
controller and original acceptance limits remain unchanged. No physics exemption,
import rescue, imposed pose or protected engine edit is involved.

The frozen source model, program, licence, acceptance contract and original
forced-stop failure remain under `test/fixtures/model-files/watt-line-source/`.
`scripts/lib/watt-line-source.mjs` reproduces the repair from the hash-checked
source. The ordinary and strict native program runs pass the original 26–29 mm
travel, 0.35 mm lateral error, 0.5 mm independent geometry error, hinge closure,
free-base stability, return and all six endpoint criteria. The separate forced
stop probe now passes both original 23.5–26° magnitude bounds; removing only the
rails and their pins permits more than 28.5° travel in both directions.

TwinTempo preserves its supplied model and program bytes. Its native tests carry
each tag’s actual body pose independently and compare travel with drum radius
multiplied by measured shaft angle, including the intermediate gear’s direction.
They check both rope lengths and positive 100 ms mean support, without claiming
positive tension at every sample. Freezing a tag fails; physically removing only
the slow cord destroys its lift law while the input still completes two turns.
Neither model’s simulation proves a physical assembly or rated lifting capacity.

English and German lessons and Examples cards name the classical mechanism.
Search accepts either language, accents and dash variants, and keeps topic and
piece-count filters. The mappings are:

| Classical mechanism | Examples |
| --- | --- |
| Hoeken linkage | Stride Lab |
| Peaucellier–Lipkin linkage / inversor | Straight Eight |
| Sarrus linkage | Sarrus Lift |
| Pantograph / Pantograf / Storchschnabel | Amplify, Pantograph Doubler, Scale Studio, Scale Echo |
| Oldham coupling / Kreuzschieberkupplung | Offset Orbit, Crossglide |
| Universal / Cardan / Hooke joints | Phase Bridge, its misphased preset, Ripple Relay |
| Watt linkage | Watt’s Line |
| Gear reduction and drum hoist | TwinTempo |

`docs/data/robot-lab-mechanisms.json` supplies names and aliases to the generated
catalogue and lessons. Straight Eight’s exact inversion and Watt/Hoeken’s
approximate straight segments remain distinct teaching claims.

All eight whole-library construction checks pass. Ten new native/collider checks
pass, including original forced-stop bounds, actual controller hold, implemented
opcodes, measured output laws and meaningful physical/observer negatives. The
collider census records zero raw stdout bytes. Thirty-three current-main native
regressions and thirty-eight catalogue/search/readiness controls pass. The normal
production build passes. Chromium passes both new models and the repaired
Integral/Root Bridge/Balance Engine import cases, complete saved programs,
controls, instructions/BOM, EN/DE lessons and classical-name search. WebKit and
exact-head hosted qualification remain pending at publication and are required
before landing. This does not claim a release or TestFlight upload.
