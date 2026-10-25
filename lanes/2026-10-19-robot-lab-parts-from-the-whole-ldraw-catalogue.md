## Robot Lab: parts from the whole LDraw catalogue (palette "+") — 2026-10-19

CLAIMED and done in one PR — Claude (Robot Lab lane, owner request and decisions: fetch
from the ldraw-stl mirror; offer parts that cannot connect as decoration). The deriver moves
from scripts/derive-part-meta.mjs into overlay/.../bw-sim/part-meta/derive.js (the script is
its command line; --compare and --generate output byte-identical). New:
bw-sim/ldraw/ldraw-catalog.js (mirror reader, range requests), part-meta/catalog-parts.js and
catalog-worker.js, sim-lab.js addCatalogPart/catalogueParts/catalogFor, the palette's "+"
catalogue view with per-part CC BY credits, the `decoration` palette category, and
BW_REMOTE_PARTS_POLICY (webpack, About row). Owns those files plus fetchLDrawClosure's
fallback; parts.json, the vendored static/ldraw/ subset and the physics are unchanged.
docs/ROBOT-LAB-ARCHITECTURE.md §5.4.1. Also in this PR (owner requests): the tab label
Robots / Roboter; the long idle help (build status, hint bar, palette help) moves into
two (i) buttons (sim-lab-info.jsx); part-geometry.js and part-thumbnails.js no longer
cache an empty result for a part whose files arrive late. Stacked on
lane/simlab-next7-20261019 (merge order: #1097, next7, this).
