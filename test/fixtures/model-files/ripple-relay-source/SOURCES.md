# Sources, design basis and evidence scope

Copyright (c) 2026, CrispStrobe. BSD-3-Clause for this document.

## User-provided instructions and corrected collection

The authoritative revised handoff was the attached
`BRICKWRIGHT_MODEL_BUILDER(2).md`, SHA-256
`b741c90e72e66ae01ebf7dfc325699b8f686ef70545d29bd967f2cc9809a3bcc`.
It required an early real-part coupling prototype, physical mounting and
clearance checks, honest actual-VM evidence, a useful negative control,
English/German learning material, CrispStrobe/BSD attribution, and a compact
integration add-on.

The latest supplied fixed-model archive and the locally accumulated catalog
were audited together with the actual source app menu. Exact baseline hashes,
prior identities and the two app-only models are in
`integration/baseline-and-novelty.json`. Earlier catalog entries and unresolved
statuses were preserved; a previous report was not treated as proof for newly
generated model bytes.

## Selected app source

The selected supplied source archive identifies revision
`c1a7c52f927b9da95215a17c65ed974c9cdf77de`. It was extracted and checked against
its archive members. It is not represented as a clean Git checkout or as a
claim about the latest public upstream commit. Runtime provenance records the
archive SHA, source tree identities, selected native modules and installed VM.

No app physics source, collision handler, controller behavior, parser metadata,
mass tuning, acceptance limit or author-triggered import behavior was modified
to obtain the release results. The physical middle bearing resolves ordinary
import's earlier contact-weld problem using a genuine supported connector path.

## Mechanical references

1. Belden Universal, **Universal Joint Phasing**,
   <https://www.beldenuniversal.com/knowledge/technical-information/universal-joint-phasing>.
   Used for the relationship between parallel middle forks, equal true bend
   angles and constant final velocity.
2. Belden Universal, **Connecting Multiple U-Joints**,
   <https://www.beldenuniversal.com/resources/technical-information/connecting-multiple-u-joints>.
   Used for the requirement to support multi-joint shaft arrangements.
3. SDP/SI, **D757 — Couplings and Universal Joints**,
   <https://www.sdp-si.com/tools/catalogs/D757-Couplings-Universal-Joints3.php>.
   Search-accessible corroboration of twice-per-turn velocity fluctuation and
   equal-angle paired cancellation; the direct page was not accessible here.

The exact 3:4:5 LEGO geometry and equations are derived independently in
`validation/DERIVATION.md`. Industrial joint load or angle ratings are not
transferred to LEGO parts. Static CAD and native solver evidence do not establish
real-world friction, backlash, stiffness, durability or motor torque margin.

## Referenced CAD and reused helpers

Standard external LDraw parts provide the exact visual geometry, including
`62519.dat` for the real cross and `62520.dat` for each fork. The complete
`61903.dat` shortcut contains two forks and a cross; physical and native BOMs
explicitly reconcile these components. No invented part identifier or flattened
decorative replacement is used for the physical joint.

Renderer and builder conventions were adapted from the supplied CC0 Scale Echo
helpers. Their unchanged inherited helpers retain that license. New arrangement,
new/adapted code and prose are credited to CrispStrobe under BSD-3-Clause.
Exact renderer results are tied to the final CAD SHA in
`images/cad-provenance.json`.
