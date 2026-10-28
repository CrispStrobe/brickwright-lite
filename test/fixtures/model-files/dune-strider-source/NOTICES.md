# Notices and attribution

## Original Dune Strider work

Copyright (c) 2026 CrispStrobe. The original model placements, integer-span mechanism adaptation, `.bw` program, builders, validation tools, analyses, catalog proposal, lessons and documentation are licensed **BSD-3-Clause**; see `LICENSE`.

No external designer's CAD, instructions, tuned dimensions, code, artwork or photographs were copied into this add-on. The mechanism is inspired by Jansen linkage topology, with independently constructed integer Technic dimensions. Credit to Theo Jansen for the Strandbeest leg concept does not imply that he designed, approved or endorsed this adaptation.

## Brickwright native runtime and metadata

Repository: https://github.com/CrispStrobe/brickwright-lite

Selected revision: `f903fa1ef9e1988bbfad563c2529120700145bbf`.

Brickwright's own code and part metadata: **BSD-3-Clause**, copyright (c) 2026 Christian Ströbele (CrispStrobe). The original tools in this package import the external checkout's parser, compiler, model preparation, geometry and native runtime. They do not bundle or relicense the runtime. The recorder's VM stepping follows the repository's native test helper, as stated in its header. Part names and connector/collider data are traced to this selected revision in the source and baseline records.

The external runtime has its own dependencies and licenses, including the recorded Jolt and Scratch packages. Consult the selected repository's `THIRD-PARTY-NOTICES.md` and the installed package licenses. No runtime/dependency binaries or sources are redistributed here.

## Standard LDraw geometry and rendered previews

The model references standard stock part filenames. Part meshes are external to this ZIP and are resolved by Brickwright's curated official LDraw library. The selected checkout records the official `complete.zip` release of **2026-09-30**.

**Credit:** The LDraw Parts Library, © LDraw.org and the individual part authors named in their source files. Source: https://library.ldraw.org/ .

The actual files state **CC BY 4.0**, or dual **CC BY 2.0 / CC BY 4.0**. Their permissions and attribution remain separate from the BSD license for this original work. License texts: https://creativecommons.org/licenses/by/4.0/ and https://creativecommons.org/licenses/by/2.0/ . No stock source mesh is modified or redistributed by this add-on.

The previews assemble and render those meshes in the original model's placements and colours. They retain the geometry attribution in `previews/LDRAW-RENDER-NOTICES.md` and `previews/render-receipt.json`, which list actual resolved source URLs, hashes, authors and license headers. Native motor phasing changes the placement of the existing moving rotor subassembly for the saved pose; the stock source file remains unchanged.

The pin/shaft source audits likewise read external stock geometry. Their evidence records dependency hashes and supports the specific nominal clearance conclusions; it does not change the geometry's ownership or license.

## Trademarks and scope

LEGO® is a trademark of the LEGO Group, which does not sponsor, authorize or endorse this project. LDraw is an independent community project. The external names are used to identify compatible parts, source geometry and inspiration.

The simulation evidence is specific to the frozen exported files and recorded runtime. It is not a physical build, product certification, hardware firmware validation, app release or promise of hardware precision.
