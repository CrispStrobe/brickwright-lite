# Component and illustration notices

The original Crossglide model arrangement, source code, lessons, documents,
observations and original equation/measurement plots are licensed under
BSD-3-Clause; see `LICENSE`. Credit: Christian Ströbele (CrispStrobe), 2026.

## External part geometry

The LDR and MPD refer to standard LDraw parts. Their polygons and textures
remain external. LDraw parts have their own author and license notices;
referencing a part does not relicense its mesh under BSD-3-Clause.
The independent geometry audit reads those external meshes and records exact
source hashes. It does not redistribute the mesh files in the source ZIP.

CAD-derived PNG/video previews, when supplied separately, include their own
LDraw attribution. Keep that attribution with the media. Original plotted
coordinates and measurements do not contain LDraw polygons.

LDraw legal information: <https://www.ldraw.org/legal-info>

## External application, compiler and verification runtime

The qualified application is Brickwright Lite at the source revision listed
in `SOURCES.txt` and the acceptance record. Its registered compiler, Scratch
VM, Jolt fork, Three.js and other runtime dependencies retain their original
licenses. `runtime/package-lock.json` records dependency versions and
integrities; dependency source, `node_modules`, binary/WASM payloads,
compiler-generated default assets and an application build are not included
in this add-on.

The existing native slider model locks relative rotation. Crossglide uses
two separated parallel physical guide axles per interface, so the model
does not rely on the unphysical roll restraint that a single guide would
otherwise acquire. No native solver setting is changed for this machine.

## Engineering references

The external manufacturer material listed in `SOURCES.txt` was consulted
for the Oldham coupling principle only. No external mechanism CAD, imagery,
code or text is included. The model's dimensions, placements and explanatory
derivation are original work.
