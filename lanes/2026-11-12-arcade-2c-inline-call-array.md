# Arcade 2c: fresh inline Number-call Array source evidence

Owner: Arcade delivery maintainer. Status: CLAIMED.

Own source-value-producers.js positional-slot and Array-read propagation only,
and focused source/native controls. A fresh inline Array literal with a fixed
in-bounds index may carry Number evidence from a selected call only when every
item has final exact Number evidence from the existing producer graph. Defer
incomplete facts and recheck final domains; mixed, opaque, undefined, mutated,
aliased, held or escaped cases must not acquire this evidence. Preserve all call
results and effects; this does not classify calls as pure or authorize references.
The existing native homogeneous Array-family proof remains authoritative.
Require nonvacuous source cuts, near misses and actual affected PXT/VM/SB3/browser
qualification before landing. Do not broaden SDK or caller provenance, change
workflow/pins/thresholds, or replay originals. Keep row 2c pending until its other
constraints are separately satisfied.
