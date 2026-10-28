# Snapgate — attribution and third-party notices

## Original contribution and inherited project material

The original Snapgate arrangement, finite program, generator, independently derived equations, documentation, lessons, validation work and procedural coil surface are attributed to **Christian Ströbele (CrispStrobe), 2026**, under [BSD-3-Clause](snapgate.txt), as requested in the model-builder brief. The motor and hub mounting patterns and validation infrastructure build on the preceding Brickwright add-ons. Their retained BSD notice is supplied in [quickstroke-original.txt](quickstroke-original.txt). These notices do not replace the licenses of external geometry or runtime dependencies.

## LDraw geometry and derived renders

The model references standard LDraw part filenames. The authoritative inventory is [bom.json](../source/bom.json). Each recursive geometry dependency used for rendering is identified in [ldraw-dependencies.json](../sources/ldraw-dependencies.json), including its original author, modification history, exact license-header text and SHA-256 hash. Those detailed credits accompany the images and measured-motion replay.

The geometry comes from the LDraw library carried by the pinned [Brickwright Lite checkout](https://github.com/CrispStrobe/brickwright-lite/tree/0a23bd8446f3cdb9a51668ea17dedb054648480a/overlay/scratch-gui/static/ldraw). Individual DAT geometry files remain external dependencies and are not redistributed in this add-on.

The new representation changes placements, colour choices, camera projection, lighting and explanatory annotations. A measured replay applies body transforms taken from the native observations. The standard source DAT geometry is unchanged. Its declared CC BY 4.0 or applicable CC BY 2.0 / CC BY 4.0 history split remains separate from the BSD license of the new model and code. The source library’s [CAreadme.txt](CAreadme.txt), [CC BY 2.0 text](CAlicense.txt) and [CC BY 4.0 text](CAlicense4.txt) are retained unchanged. License links: <https://creativecommons.org/licenses/by/2.0/> and <https://creativecommons.org/licenses/by/4.0/>. No source-author endorsement is implied.

### Complete shock absorber and the procedural coil surface

The native source places the standard **2909 cylinder** and **2910 piston rod**, both by **Marc Klein [marckl]**, as the two moving components of one complete stock 9L shock absorber. The physical inventory includes that assembly’s factory spring. The two CAD components are not two purchased complete shock absorbers.

The official [74741-f1.dat complete soft 9L shock assembly](https://library.ldraw.org/parts/12395), also by Marc Klein, identifies the three standard components: cylinder 2909, rod 2910 and soft spring u9409-f1. Its record includes the alternative assembly identifier **2909c03** and declares **CC BY 4.0**. The official [u9409-f1.dat extended spring](https://library.ldraw.org/parts/16088) is likewise credited to Marc Klein and licensed **CC BY 4.0**; its history records **Philo’s 2017 corrections** to the turns, winding and origin.

A separately generated original coil surface makes the spring visible in the supplied renders and replay. Its broad dimensions are informed by those official records, but their polygon mesh and spring2dat code are not copied. This surface is an approximation between the cylinder and rod seats. It follows their poses, is not an additional native rigid body, and does not represent measured wire deformation. The native restoring force is supplied by the runtime’s existing internal slider spring law. No physical spring-force calibration or browser rendering of a deforming coil is claimed.

## Mechanical references

### Mirza Cenanovic, Applied Mechanics §11.5

[Applied Mechanics, §11.5 Over-centre mechanisms](https://mechanics.ju.se/Mechanisms/OverCentre.html), by **Mirza Cenanovic**, Jönköping University, is the principal mechanical reference. Its creator/licensing footer and the book’s [Image credits](https://mechanics.ju.se/ImageCredits.html) license original text, figures and animations under **Creative Commons Attribution 4.0 International**, with separately listed third-party exceptions. License: <https://creativecommons.org/licenses/by/4.0/>.

The reference supports the over-centre elastic-member family: moment reversal, unstable alignment, an energy barrier and stable states against physical stops. The chapter’s simplest derivation uses a tension member with a fixed anchor. Snapgate instead uses a compressed stock shock absorber with a driven anchor. Its part arrangement and offset-eye spring equations are independently derived in [MECHANISM.md](../docs/MECHANISM.md).

No book illustration, animation, source code or prose passage is copied. Embedded third-party videos retain their own rights and are not included or treated as part of the book’s CC BY material.

### Henry T. Brown, movement 87

[Five Hundred and Seven Mechanical Movements, movement 87](https://507movements.com/mm_087.html), by **Henry T. Brown**, is a historical switching counterpart. A weighted lever passes vertical and falls to the other side, changing the state of a reversing clutch. Gravity supplies its bias; it is not the same compression-spring arrangement as Snapgate.

The book was originally published in **1868**; the website identifies its static source as a **1908 edition**. The publisher’s [About and copyright page](https://507movements.com/about.html) identifies the original static text and illustrations as out of copyright, subject to applicable national law, and distinguishes the separately copyrighted modern animations, animation code and page design.

No animation, image, drawing, source code or passage from the site is incorporated. The reference supports the historical mechanism only. The modern website as a whole is not presented as openly licensed.

## Runtime and dependencies

Native development and qualification use the unchanged public source pinned at commit `0a23bd8446f3cdb9a51668ea17dedb054648480a`, its registering compiler and VM overlay, Scratch VM `4.8.115`, and the custom Jolt package `1.1.0-bw.5`. The portable setup records the selected source-file hashes and exact dependency graph. The installed runtime, npm modules, complete application checkout, default SB3 archive and LDraw library are excluded from this add-on. Those projects retain their own licenses.

Generated compiled-project JSON, measured observations, source-hash records and the new validation scripts are included as evidence for this model. Preserved development fixtures are earlier versions of the same original contribution, not third-party models. A failed development run is not a qualification of the final source.

LEGO and SPIKE Prime identify the component system. This independent add-on does not claim LEGO endorsement.
