# TwinTempo — validation and delivery record

**The final 81-part model and its finite program passed native simulation under qualification contract revision 2.** The geometry, program and measurements are included in this standalone add-on. Application installation, browser operation and a physical build are separate, untested stages.

Original work: CrispStrobe. BSD-3-Clause. Rendered LDraw geometry retains the attribution and terms in `visuals/NOTICE.txt` and the accompanying source manifests.

## What was checked

| Layer | Result and exact scope | Evidence |
|---|---|---|
| Export | PASS: deterministic regeneration; unique part IDs and proper rotations; placement/BOM agreement; tested model/program hash equality; complete external mesh resolution in the recorded renders; ZIP CRC and archived byte equality | `evidence/export.json`, `SHA256SUMS`, package receipt beside the ZIP |
| Construction | PASS for the documented nominal interfaces and sampled geometry. No unresolved native collider pairs in 147 ideal poses from −5° to 725° in 5° steps, or for the tags in all 1,091 measured poses. The native collider penetration tolerance is **1 LDU / 0.4 mm**, with intended insertions and inferred gear meshes excluded | `docs/construction.md`, `evidence/construction-inspection.json`, `evidence/clearance.json` |
| Gear phase | PASS for the actual saved +7.5° idler phase in a sampled **2D midplane** profile check. 181 input poses cover one 45° tooth-engagement period. This is not a continuous 3D or manufacturing-tolerance proof | `evidence/gear-profile.json` |
| Native mechanism and program | PASS: exact exported files through the registered parser/compiler, Scratch VM, Robot Lab extension, SPIKE virtual hub controller and Jolt physics. Ten scoped gates passed | `docs/qualification-contract.md`, `evidence/qualification.json`, full recording and trajectory CSV |
| Catalog and lessons | PASS for local metadata checks and both EN/DE lessons through the native lesson loader. One proposed catalog entry, not an installed entry | `evidence/schema-check.json` |
| Application | UNTESTED: browser import, controls, Blocks rendering and lesson/instruction presentation; installation was not requested or performed | README integration notes |
| Physical build | UNTESTED: real assembly, lifting capacity, cord winding, friction, clearances under manufacturing variation and operation on hardware | Construction limitations |

The ZIP receipt is generated only after reopening the archive, checking every member CRC, and comparing every archived file with its final source bytes. The archive's own hash is kept outside it to avoid a circular hash claim.

## Measured native result

The chassis was freely supported on the plain floor. It was not frozen. The import had six dynamic bodies: chassis, three shaft assemblies and two independent tags. Three hinges, two gear couplings and two rope couplings were inferred from the actual model. There was one SPIKE Prime hub and one medium angular motor, explicitly connected to port A. Ordinary import and explicit `autoPorts:false` produced identical topology. No engine changes or extra collision suppression were added.

| Measurement | Result |
|---|---:|
| Program completion, including 0.50 s cold interval | 26.75 s |
| Observation coverage, including 0.50 s after completion | 1,091 samples over 27.25 s |
| Sampling / physics step | 25 ms / 5 ms |
| Red tag maximum vertical rise | 35.19595 mm |
| Blue rise at the red tag's peak | 11.72043 mm |
| Corresponding measured travel ratio | 3.00296 : 1 |
| Blue tag's own maximum vertical rise | 11.73200 mm |
| Red / blue final vertical return error | 0.01205 / 0.00407 mm |
| Maximum trajectory error against measured-angle prediction, either tag | 0.24532 mm |
| Maximum absolute fast rise minus three times slow rise | 0.73532 mm |
| Input-angle envelope | −0.25007° to 720.19862° |
| Final input angle | −0.24653° |
| Maximum chassis horizontal movement after settling | 0.00357 mm |
| Maximum chassis angular change after settling | 0.000123° |

Final program state was `completed=1`, `failed=0`, `stage=3`; the motor was idle in hold. Its hold captured the attained angle. These are simulation measurements, not physical accuracy claims. Tag positions came from independent body-pose observations relative to the observed chassis; the expected equations did not generate them. A frozen-output alteration of the recording correctly failed the useful-travel observer.

`visuals/trajectory.png` plots the actual recorded samples. The main model preview and six assembly illustrations are saved-pose CAD renders with schematic cords. `evidence/recording-inspection.json` additionally reports the full 3D endpoint displacement from the same unchanged recording.

## Preserved failed checks and revised claim

Revision 1 completed the motion but failed three observer checks. It incorrectly expected literal/menu blocks to expose primitive functions, read a nonexistent controller-mode field, and demanded positive rope impulse at every observed sample. Its original contract, source, recording and failed result remain in `evidence/first-run-v1/`.

Before the second complete run, revision 2 corrected those two observer assumptions and replaced the continuous-impulse requirement with a narrower, explicit criterion: each sampled 100 ms mean support force must exceed 0.001 N and rope endpoint distance error must stay within 0.5 mm. The second run passed. It still contains 249 red and 170 blue zero-impulse samples; the longest consecutive interval was 50 ms. The minimum 100 ms mean support values were approximately 0.00245 N and 0.00490 N. Maximum rope-distance error was approximately 0.2453 mm.

**The model, program and engine bytes did not change between these two runs. Continuous physical cord tension is not established.** The revised contract and all original failures remain visible.

## Operating limits

The delivered program commands **0° → 720° → 0°**, using fresh unwrapped encoder differences at 60°/s, up to two low-speed trims per move and a 60-second watchdog. The qualified envelope including overshoot is **−5° to 725°**. There are no physical hard stops at those values.

The native rope uses a constant 2.8 mm bare drum radius and a centreline distance constraint. Tangential exit, cord thickness, knots, stretch, winding layers and motor-cable contact are outside the simulation. Freely swinging tags can reach the frame or hub outside the demonstrated near-vertical path. No unpowered self-locking or hardware load rating is claimed. After manual movement, interruption or a fault, restore the saved model and winding datum before another run.

## Reproduction and integration

The selected Brickwright checkout is `e8afd8281647bd5d06d31d9e01885d7d76a85412`, with Node v24.19.0, npm 11.9.0, Scratch VM 4.8.115 and Jolt 1.1.0-bw.6. Runtime source and original lock bytes were preserved. Exact setup commands, source identities and the separate passing Quickstroke baseline record are in `evidence/runtime/`.

No user collection was supplied; the comparison used the pinned upstream gallery recorded in `evidence/runtime/catalog-inputs.json`. This add-on does not claim integration with another collection. To run it now, import the LDR and open the BW as described in README. A future gallery installation must copy the assets, add the proposed record while preserving existing entries, register required lists and run the application's focused build/browser checks.
