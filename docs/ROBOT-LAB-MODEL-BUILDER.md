# Building Brickwright machines that survive integration

A reusable brief for model-building agents, including agents with Python/CAD tools but no browser, Node installation or full app checkout.

## Outcome and authority

Build an interesting, mechanically distinct physics experiment with **one hub and 1–3 useful motors**, unless the current user specifies otherwise. Models above 50 pieces are welcome; add structure for a mechanical reason. Deliver editable LDraw/MPD, a finite native `.bw` experiment, an explanation and evidence appropriate to your tools.

Use the latest supplied corrected collection and app source as the baseline. Record their identities. A historical handoff, old inventory or passing report is evidence about that snapshot. Merge one new entry into the actual baseline; never replace its catalog with an older bundled copy. Check mechanisms as well as names before proposing another model.

Credit our original/adapted work to **CrispStrobe**, normally **BSD-3-Clause**. Preserve inherited notices. External models and geometry need compatible redistribution terms: MIT/BSD/Apache/MPL/CC0/CC BY/CC BY-SA or similar; exclude NC and unlicensed material. A mechanical idea and someone else's CAD, image or prose have different copyright implications. Record sources and component licenses separately.

## What the earlier deliveries teach

Both earlier handoffs contain useful methods. Their weakness as a next-model brief is that those methods are buried in one machine's history, old runtime assumptions, frozen inventories and large recovery bundles. Keep reusable instructions here; put a particular machine's source, measurements and dependency lock in its package.

The repairs identify different failure classes:

- **Construction:** overlapping pins in Stride Lab, inadequate motor/hub restraint, short shafts, insufficient linkage clearance and Tilt Lab's missing startup supports. These can often be caught with CAD and connector checks alone.
- **Controls:** wrong signs or excessive speeds, mixed percent/degree-per-second units, sequential substitutes for concurrent programs, and thousands of repeated blocks. Test the actual program and keep it compact.
- **Runtime support:** Sarrus required spatial-loop stabilization and worm-phase handling; Chess required continuous guides and finite magnetic forces. Correct-looking CAD cannot establish that these features work in a particular simulator.
- **Metadata and app integration:** conservative part colliders, missing drawing dependencies, direct-colour handling, gallery registration and lesson loading. These require the relevant app path to be checked.

A failed app run is not automatically a bad design. A passing app run is not automatically buildable CAD. Diagnose which layer failed and preserve that distinction.

## 1. Establish what this environment can prove

Spend a short initial check on available files, tools, time and disk. Reuse a supplied working runtime and its lockfile when available. Avoid spending most of a constrained session recreating a full development machine.

| Available capability | Work to complete | Claim permitted after checks pass |
| --- | --- | --- |
| Text/Python/CAD | Parametric placements, topology contract, dimensions, connector occupancy, clearance analysis, export integrity, native program source | CAD/analytical validation, with exact limits stated |
| Actual compiler and controller/Jolt | Above, plus exact-file preparation, topology inspection and native output measurements | Headless mechanism validation; program execution only if the actual VM ran it |
| Built app and browser | Above, plus real imports, automatic Blocks, rendering, manual controls, lessons and instructions | App validation on the recorded build/browser |

**Unavailable is UNTESTED, not PASS.** Deliver the completed supported work and a precise integration checklist. A small reproducible failing case is useful. If the difficult feature cannot be tested, favor an already supported mechanism or clearly mark the result as a prototype. Keep observed failures visible.

Use the actual selected revision's instructions. Dependency versions, aliases, author-header heuristics, directives and import options change. Do not silently substitute stock Jolt, a stub compiler, rewritten controller or a different app revision. Keep extracted reference source unchanged; propose engine changes separately when needed.

## 2. Prove the difficult mechanism before detailing the frame

Write a short design contract:

- The physical question and one independently measurable output.
- Named rigid assemblies, intended joints/axes and motor ports; identify every independent payload.
- Dimensions, saved pose, encoder datum/sign, transmission ratios, operating range and singularities.
- Expected output travel, useful accuracy, sample coverage and watchdog, chosen before the final run.
- Any required special behavior: sliding bores, carrier-relative gears, closed spatial loops, magnets, friction, contacts or drawing.

Build the smallest representative **real-part** prototype of the risky joint/coupling first. Inspect actual inferred bodies, joints, couplings and signs if a runtime is available. A prototype with a frozen base or direct API drive is a development probe; final qualification must use the complete delivered machine and declared program.

An analytical pose function is valuable for assembly and swept-clearance checks. Its predicted positions must never be fed back into a claimed physics demonstration.

## 3. Design every physical interface explicitly

Generate placements deterministically with unique semantic IDs. For each module interface, record hole centers, connector types, axis directions, layer thicknesses, male occupied intervals, required engagement, keyed phase and the owner of each shared fastener.

Use the actual variant's metadata **and mesh** when available. Common traps:

- LDraw uses 20 LDU per stud, 8 per plate, 24 per brick; 1 LDU = 0.4 mm, +Y down. Current world conversion is `(x, −y, −z) × 0.0004` metres. Matrices are row-major; require finite values, `RᵀR ≈ I` and `det R ≈ +1`.
- Hole count and hole-to-hole span differ. Part origins, asymmetric pins, integral pins, thin members, blind bores and axle cross-key phase matter.
- Allocate one physical pin to a shared stack. Check male–male overlap, collars, blind ends, axle insertion and retention. An integral molded pin already occupies its hole.
- Connectivity does not establish rigidity. Trace motor-stator reaction torque into the chassis. Restrain housings, bearings and hub with actual parts.
- Give a translating carriage physical restraint against roll. Support it throughout its full travel. One round bore on one axle can leave unintended rotation.
- Check shaft, rotor, crank, payload and cable corridors through the operating sweep, including endpoints and tight intermediate poses. Audit same-body overlaps too: the simulator can hide them.
- Check the cold, reset and unpowered pose. A later motor-hold command cannot provide missing startup support.
- Keep free balls, pallets and chess pieces independent. Distinguish LEGO placements, custom physical materials, decoration and inferred solver parts in the BOM.

Use exact geometry to resolve a suspicious conservative collider or open-mesh false positive. Record the particular mating interface and justification. “Same body” or “collision disabled” is insufficient.

## 4. Export, control and observe the delivered files

Use canonical supported part names where possible. Verify aliases and any saved rotor phase against the selected parser. Give every motor an explicit port, preserve stable IDs and use truthful author/license headers. Groups and assembly steps organize a build; they do not create physical welds.

Produce equivalent LDR and MPD placements. Resolve every referenced custom/posed part; include its permitted sidecar or embed it in the MPD. Standard LDraw geometry can remain external if that dependency is explicit. Do not bundle an entire runtime or parts library merely to inflate portability.

Write a short finite `.bw` experiment using vocabulary verified against the actual registering compiler (`sb3-creator-register-art.js` in current source):

1. Start, hold the required inputs and verify the saved starting datum.
2. Command bounded motion using **target minus fresh unwrapped encoder angle** and explicit speed units.
3. Start coordinated axes concurrently and join their completion. Prefer shared receivers over thousands of unrolled repeated blocks.
4. Hold/check completion; use dwell only for observation or settling.
5. Exercise the declared range, return to the datum and finish in the declared hold/coast mode. Document manual limits and reset behavior.

`lab` speeds are degrees per second in current source; ordinary hub speed commands can use percent. Verify signs from the placed drive. Simulation commands are not automatically downloadable hardware firmware.

Run the actual exported bytes through the actual parser, compiler, extension, VM and controller/physics when available. A handwritten dispatcher can test a limited API sequence, but cannot establish Scratch scheduling or full-program behavior. A VM finishing can also conceal no-op commands: require useful physical output, correct travel and completion evidence. Implement every host callback the program uses: an absent reset/load hook can silently do nothing in a headless adapter. Gallery selection already loads the saved pose, so prefer a starting-datum guard over a redundant in-program reset. If a reset is required, verify it recreates the world and preserves the intended program/clock behavior in the actual app.

Measure output points/angles from actual body poses relative to the measured chassis. Keep the measured data independent of the expected equation. Check the whole trajectory, continuity, direction, joint closure, passive stability, payload transport and return—not only motor endpoints. Reject empty selections and require enough motion/samples to support the claim. Unwrap rotations.

Include a relevant negative control where feasible: an unmoving output must fail; removing the magnetic field must prevent transport; removing a necessary support should expose the failure. Analytical closure, native dynamics and geometric buildability remain separate checks.

## 5. Finish at the capability boundary, with usable evidence

Use a compact acceptance record:

| Check | Result | Evidence and scope |
| --- | --- | --- |
| Export/dependency/BOM integrity | PASS / FAIL / UNTESTED | Exact filenames, hashes and counts |
| Physical construction and swept clearance | … | Method, poses/coverage, unresolved pairs |
| Intended topology and import assistance | … | Bodies/joints/couplings; ordinary/strict differences |
| Actual native program and output | … | Runtime identity, trajectory metrics, completion, negatives |
| Browser/app workflow | … | Build/browser, imports, controls, drawing, lessons, instructions |
| Physical build | … | Actual observation, if performed |

Do not change author credit, freeze a free body, add invisible model joints, disable broad collisions or relax a failed acceptance limit to manufacture a pass. A justified simulator repair belongs in reviewed engine code with a reproducer, regression tests and new qualification. Disclose mathematically equivalent solver stabilizations; verify that the original physical constraints still hold.

A geometry edit invalidates affected clearance/topology/motion evidence; a program edit invalidates execution evidence. Record the change and rerun the relevant checks. A documentation or print-only change need not trigger unrelated long tests. Freeze final model/program bytes and hash the actual files placed in the ZIP. Check ZIP CRC and missing dependencies. Label CAD illustrations, analytical animations and measured-physics visuals accurately.

## Delivery: one small add-on, one clear next step

Include:

- `models/<slug>.ldr` and `.mpd`, required permitted sidecars, `programs/<slug>.bw`.
- Deterministic source or an exact placement ledger; part/color BOM and useful assembly order.
- A brief README: what it teaches, motor roles, reset, run, manual bounds and known limitations.
- EN/DE lesson content: observe, try, explain, predict/reveal, related examples; matching equations and units.
- One new catalog entry; source/license notices; compact validation summary, raw useful observations and reproducible check source. Keep drafts outside the release folder.

For an external builder, this is an **integration-ready add-on**. Say which app checks still need the integrator. Do not claim installation from the presence of catalog JSON.

For an agent with app access, follow current repository ownership/dependency rules and preserve other worktrees. Current integration touches the model list in `sim-session.js`, the dialect and VM model menus, generated catalog/lessons and their focused tests. Verify actual file imports, automatic Blocks and project title, all motors/Stop/hold, missing-part requests, rendered output, lessons, complete instructions and BOM. Export the fixed library and run the normal build/checks. Keep local validation, hosted CI, merged source and release delivery distinct.

The final message should link the actual files, state piece/motor counts and report PASS, FAIL and UNTESTED plainly. The next agent should be able to start from that small record without reconstructing a previous conversation or reading an embedded software archive.
