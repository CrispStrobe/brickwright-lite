# atan2 in existing Number consumers

Status: CLAIMED; merge before implementation. Owner: Arcade integration.
Base: `e7cc6678b5d0b8e887192142146f0cb945ecdba6`.
This precisely extends the merged
[atan2 capability claim](2026-10-25-arcade-atan2-authoring.md), in the same
owner's PR #1128. No other lane or runtime guest is taken over.

Read-only integration review found two additional fixed selector lists:

- `overlay/scratch-gui/src/lib/bw-makecode/array-native-frame-reset.js`:
  admit atan2 only through the existing exact mathBinary block shape, fixed
  operation field, and independently proven Number arguments. Keep receiver,
  initialization, reset, ownership and all-writer obligations unchanged. No
  unknown/default producer or caller-provided Number certificate.
- `overlay/scratch-gui/src/lib/bw-makecode/native-array-binary-domain.js`:
  admit the exact unshadowed Math.atan2 namespace call in the existing complete
  effect census. Preserve its primitive/initialized argument checks, opaque
  ToPrimitive refusal, real call evaluation order, all Array contents/effects
  and sticky source currentness. A Number result never certifies its inputs.

Qualification extends the same owner's `test/arcade-math-atan2.test.mjs` and
the existing complete native Array domain/reset source cohorts. Add a genuine
atan2 result used in an owned Number Array and native addition, paired with
unknown/reference arguments, changed operations and source-edit refusals.
Keep original assertions and include actual original/emitted PXT plus native
Code/saved-project/reimport execution in final hosted qualification. Document
the result in this claim and the existing capability/GUI handoff; source-only
success does not qualify actual frame reset or whole applications.

No generic producer defaults, parser/helper recognition, VM/firmware/model
changes, supplier pin movement beyond the parent claim's upstream dialect,
workflow edits, threshold relaxation or additional actual dispatch. Existing
source and event/intake ownership stays with the same Arcade owner.
