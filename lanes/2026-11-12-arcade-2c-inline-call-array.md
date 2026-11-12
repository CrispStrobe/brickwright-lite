# Arcade 2c: fresh inline Number-call Array source evidence

Owner: Arcade delivery maintainer. Status: SOURCE CANDIDATE; actual guest qualification pending.

Own source-value-producers.js positional-slot and Array-read propagation only,
and focused source/native controls. A fresh inline Array literal with a fixed
in-bounds index may carry Number evidence from a selected call only when every
item has final exact Number evidence from the existing producer graph. Calls
must target an unchanged ordinary function directly and have only literal
numeric-expression arguments; member/SDK calls remain outside this new channel.
Defer
incomplete facts and recheck final domains; mixed, opaque, undefined, mutated,
aliased, held or escaped cases must not acquire this evidence. Preserve all call
results and effects; this does not classify calls as pure or authorize references.
The existing native homogeneous Array-family proof remains authoritative.
Require nonvacuous source cuts, near misses and actual affected PXT/VM/SB3/browser
qualification before landing. Do not broaden SDK or caller provenance, change
workflow/pins/thresholds, or replay originals. Keep row 2c pending until its other
constraints are separately satisfied.

Focused controls preserve captured unknown-write and arity refusals, and check
three-sibling middle-selection emitted order. The actual PXT simulator and
headless Scratch VM both produced trace 123 and selected result 2. Actual VM
export, TypeScript reimport, Code reparse and a fresh saved-SB3 reload retained
those results. Before merge, run the actual browser editor acceptance and all
enabled final-head checks; retain mixed-domain, capture and provenance near
misses. This one case does not qualify the whole project or corpus.
