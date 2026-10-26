# Image effects in closed source-start reset nonreachability

Status: CLAIMED; merge before shared proof implementation.
Owner: Arcade integration, continuing #1128 and the merged Image-origin scope.
Base: main `ad8628eb05ba0b44f0c723a378f245d31ae5f514`.

## Measured boundary

The unchanged Image-values source now passes its first direct and JSON export.
Reimport followed by a second export retains a real global `refs = null` writer
beside the later Array assignment in its actual startup procedure. Local Array
readiness is established, but the global producer union still contains the
reset. The connected indexOf operations correctly refuse that union.

Extend the existing closed source-start effect proof to show that this reset
cannot reach any read. Do not convert Image annotations or successful Image
observations into Array, initialization or producer authority.

## Exact implementation scope

- `overlay/scratch-gui/src/lib/bw-makecode/array-source-start-reset-effects.js`:
  preserve its owned snapshot, actual entry/caller/definition identity, complete
  writer/read inventory and used-only sticky currentness. Model the bounded
  builtin Image creation, clone, fill, pixel mutation/read and primitive/Image
  operations required by the fixture as private effect domains only.
- Admit a one-argument identity callee only from its complete actual definition:
  an optional exact fixed Any constraint declaration followed by one return of
  that same formal, with no other statement or entry. Preserve exact argument
  evaluation, fresh callee frame and definition/prototype identity. No general
  parameterized procedure or opaque callback exemption.
- `array-reference-export-authority.js`: consume only the independently proved
  unreachable reset result. Existing private local-prefix reconciliation may
  model the same exact native effects; preserve every non-reset writer, actual
  fresh Array allocation, global publication and remaining type/readiness gate.
- Focused new `test/array-source-start-image-effects.test.mjs`, existing
  `test/arcade-image-addition-export.test.mjs`, necessary exact GUI dependency
  rows, this claim and existing Arcade handoff/qualification documentation.

No edits to other reset helpers, runtime algorithms, SDKs, pins, suppliers,
workflows, assertions, timeouts or baseline accounting. No private inputs or
receipt bodies in outgoing files.

## Proof and qualification

Evaluate real input effects in original order. Track each actual private Array
allocation and real overwrite; Image effect domains supply no public value or
Number fact. Reject early reads, conditional/missing overwrite, self-read,
unknown calls, capture/registration, competing entries, recursion, yield,
reflection/prototype changes, malformed or ambiguous identity definitions and
later incompatible writers. A matching procedure name is insufficient.

Preserve the existing source-start and local/frame reset controls. Add direct
and JSON positive controls for the real Image fixture's second export and
negative controls for each broadened effect boundary, with independent guard
cuts and permanent mutation/restore expiry. Qualify actual original/native VM,
editor and save/reopen on the final combined hosted candidate. Source success
alone does not complete an application or change the corpus count. Use one
coordinated automatic qualification; no duplicate full dispatch.
