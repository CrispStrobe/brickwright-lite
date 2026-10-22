# Mechanics intake review

PR #1235 contains useful model assets, physical-band instructions, finite manual
controls and quantitative Circle Splitter / revised Offset Orbit judges. Its
original branch and commits are preserved in a normal composition. This review
adds Cusp Lab and retains the independently repaired Integral integration.

## Corrections

- Integral's two construction-check exemptions were removed. The original fork
  mount shared a carriage hole with an existing bridge pin. Moving the fork to
  the clear left seat, relocating its shaft and adding one retaining bush gives
  155 parts. All eight existing construction checks passed without exemptions.
- Integral remains CrispStrobe / BSD-3-Clause. Existing authored-model import
  semantics preserve passive bearings for gallery, raw import and project
  reopening; the redundant project-schema autoPorts flag was not adopted.
- Product Plotter now checks the actual y=ab/88 mm law throughout the run, all
  15 settled cells and signed held-input gains. Removing only the real swivel
  pin retains both moving inputs while destroying multiplication. Frozen output
  observations also fail the same judge.
- Gimbal Lab now checks measured serial-axis orientation, the Jacobian
  determinant, independent axes at zero pitch, aligned axes near 90 degrees,
  isolated A/C movements and cancellation at lock. A frozen marker fails.
- Sky Courier now checks both rope length laws, sampled extension, four actual
  targets, complete settled windows, freestanding frame and return. Native
  checks require every settled tension sample to exceed 0.001 N. Browser
  observations cannot establish cable force. A separate unpowered native test
  checks support; removing only rope B must lose support. Zero impulses during
  travel remain in observations and are not confused with settled support.
- Cross-block collider changes now reproduce through the standard mesh deriver.
  The two parts retain full 20-LDU axle bosses with measured 9-LDU radii instead
  of filling their clear corners with rectangular boxes. Mesh coverage and
  generator identity have dedicated checks. The motor rotor collider index is
  preserved by the inherited stator-recess refinement.
- Cusp Lab adds 128 parts and one motor, a finite forward/return program and
  bounded manual targets. Independent actual-part observations check both
  continuous paths, the fixed cusp and backtracking windows, the predeclared
  loop crossing and a frozen-output refusal.

## Source identity and duplication

The two Sky Courier archives are identical. Counterturn is already the same
120-part assembly in the library. The Bit Keeper archive is an earlier fixed
library export, not a new model. Offset Orbit's 191-part revision replaces its
141-part predecessor. Source fixtures retain hashes, licenses, original geometry,
programs and relevant supplier acceptance contracts.

Product Plotter omits the supplier's in-program `lab reset`: the gallery has
already reset the model, and a VM reset would replace its active session. Sky
Courier adds the missing DEVICE declaration and simulation start. Motor targets,
feedback, geometry and finite-program operations otherwise retain the source.
These exact adaptations are checked against frozen supplier bytes.

## Qualification boundary

Native mechanics, construction, production-browser operation and physical
hardware are separate evidence. The source is still a candidate until the final
production GUI and exact-head hosted checks pass. Earlier supplier/browser
receipts do not qualify a changed model or rebuilt application. No new native
release or TestFlight delivery is implied.

The subsequent user request adds Balance Engine and Root Bridge. Their intake
is tracked in the same lane; neither inherits the earlier models' qualification.
