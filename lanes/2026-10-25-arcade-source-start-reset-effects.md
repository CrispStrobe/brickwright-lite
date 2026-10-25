# Closed source-start reset nonreachability

Status: CLAIMED; merge before implementation. Owner: Arcade integration,
continuing PR #1128. Preserve all earlier local/frame reset guards.
Base: `1f2842e524e6633b5f250a18e5205b2ee84b9518`.

## Actual boundary

Unchanged source fixtures with Math.min and Math.atan2 both import/export once
and reimport cleanly, then refuse the second export's global Array item read.
Reimport explicitly resets the global to null before a unique startup call;
that call constructs a fresh local Array, pushes values, publishes it to the
global, then reads it. A variant with a real zero-argument value procedure also
refuses the local Array mutation. These are pre-existing general reset gaps,
not grounds to suppress atan2 or remove the Array from its regression.

The existing local theorem deliberately excludes globals and other procedures.
Add a separate bounded proof rather than relaxing those exclusions.

## Exact scope

- New `overlay/scratch-gui/src/lib/bw-makecode/array-source-start-reset-effects.js`:
  private owned-JSON source-start activation/effect proof with closed zero-arg
  scalar value-procedure summaries shared by its local/global paths.
- `array-reference-export-authority.js` in that directory: instantiate this
  proof from the actual physical context and use it only to discount independently
  unreachable null/undefined reset writers. Recheck used-only sticky currentness
  at every cached/public publication and diagnostic exit, matching existing
  reset dependency patterns. Preserve all non-reset writers.
- New complete `test/array-source-start-reset-effects.test.mjs`: genuine
  importer, direct Creator, exporter and authority; no VM harness in source
  controls. Append only this exact test to an existing dependency-policy key
  if the actual imports require it. Preserve all original tests and fixtures.
- This claim and existing Arcade handoff, task and GUI ledgers.

Leave `array-native-frame-reset.js` unchanged by this claim. No generic producer,
initialization, sourceCallerArray, parser, SDK, runtime, supplier, baseline,
timeout or workflow change. No new actual dispatch or borrowed original result.

## Proof contract

Admit an owned frozen snapshot with complete physical input/next/parent/cell
and unique declaration/prototype/call identity. Preserve extension, implicit-entry,
cloud-variable, monitor, ambient-prototype and source-currentness guards.
Begin with one relevant source-start chain, one actual direct zero-arg startup
call, hide-only unrelated source starts, and independently closed zero-arg
value procedures. Reject competing hats, dynamic names/arguments, extraction,
callbacks, recursion/reentry, yield, reflection and unknown effects.

Evaluate the actual finite graph in execution order using private primitive,
null/undefined, fresh-allocation and cell-alias effect tokens. A global reset is
dead only when every admitted path definitely overwrites its exact cell before
any read, copy, escape, publication or callback observation of the old value.
The overwrite RHS must not read that old cell. A local reset needs exact frame
ownership, no prior read/alias, and direct fresh construction before use.

Value procedures require exact canonical definitions/prototypes, empty actual
arguments, complete supported bodies and mandatory scalar return. Their normal
completion, return domain and effects remain separate facts. Transfer genuine
scalar reads/writes to independently resolved non-candidate cells, including
the argument-order counter fixture; do not skip or freeze those writes. Refuse
candidate-cell access, reference/Array escape, arbitrary calls, fallthrough and
nonlocal exits. Scalar String results stay String, not Number by annotation.

Use one shared bounded evaluator for the new local/global decisions. Build it
from physical identity and actual bodies before original type/initialization
propagation. Do not call initialized/cellTypesAt to justify a reset removal on
which those same facts depend. Existing Array producers, contents, all writers
and operation initialization must independently pass afterward. The proof grants
only reset-writer removal, never an Array, value or initialization certificate.

## Complete acceptance

Keep both min/atan2 fixtures and the called-value variant through initial export,
full emitted-file import, second export, Code and another import. Include renamed
identities, global and local resets, independent scalar side effects and exact
argument order. Preserve all original local/custom-kind/overwrite/prefix cohorts.

Refuse old-global or old-local reads/copies, premature captures, visible monitors,
late resets/non-Array writers, missing/conditional/loop-only publication, wrong
target/ID/cloud cells, duplicate declarations, extra entry/call/hat, opaque or
yielding operations, recursive or malformed callees, unknown/reference returns,
source/prototype edits and restoration. Mutation cuts must detect omitted read,
publication, actual-body/callee or sticky-currentness checks; removing the new
discount must fail unchanged genuine positives. No fabricated procedure result.

Run complete source controls within established bounds and retain failures.
Keep actual original/emitted PXT, native, Code, saved-project reload and GUI
qualification on the final hosted composition. Source-only success does not
close the actual frame/Array journey or change application counts.
