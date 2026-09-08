# Fixed-profile editor draft bridge

`src/lib/bw-286-lab/editor-draft.js` provides two explicit-gate conversions:

```js
const draft = toEditorDraft(recipe, {enabled: true});
// Edit layout and supported wires in this separate draft, then save it as JSON.
const recipeAgain = fromEditorDraft(draft, {enabled: true});
```

The top-level envelope is `bw-experimental-editor-circuit`, version 1. It contains
the engine configuration metadata and an editor-shaped `circuit` with placed
parts, nested wire endpoints, a fixed 5 V declaration and no breadboard jumpers.
This is **not a normal Circuit Editor project file**. Neither conversion injects
an engine into the editor, registers a palette item or calls `Circuit.fromJSON`.
The existing lab's recipe import deliberately does not accept this draft envelope.

## Exact mapping

| Engine recipe | Editor-shaped draft |
| --- | --- |
| Part `id` | Same fixed profile identity |
| Part `type` | `kind: harris_lab_<type>`; never aliased to a supported CPU |
| Model pin list | Explicit `terminals`, derived from the pinned board models |
| Flat `from/fromTerminal`, `to/toTerminal` | Nested `{part, terminal}` endpoints |
| ROM, alias, profile and backend | Separate `configuration` metadata |
| No layout fields | Finite `x/y`, quarter-turn `rotation`, persisted in draft |

The engine recipe produced on conversion back contains no layout. The draft
itself retains layout when serialized; no layout-to-electrical connection is
invented. There is no implicit connectivity from proximity, breadboard seating,
wire IDs, net IDs or power symbols.

Unknown parts, duplicate identities, changed terminal lists, unknown endpoints,
parameters, PCB data, breadboard jumpers, non-5 V declarations and unsupported
fields fail. Wire removal is allowed and preserved, so an electrically broken
draft faults when the real session runs instead of gaining an invisible wire.
Part identity and inventory remain fixed; this is not a general component compiler.

The production editor loader normally normalizes aliases and may discard malformed
wires. That behavior is intentionally not used here: a dropped CPU bus wire could
change the machine while appearing to be an import success. A future visual editor
adapter must consume this strict draft contract, with separate default-off execution,
without altering the shared production engine injection point.

## Local verification

`test/harris-editor-draft.test.mjs`: five tests pass, covering gates, JSON topology
round-trip and actual 47-instruction guest execution, layout isolation, fourteen
unsupported mutations and a removed-power-wire execution fault. Combined with
the application lab tests: nine tests, zero failures or skips.
Including the existing 8086 diagnostics suite: 15/15 pass, zero skips.

The lab now opens a visual draft dialog with a logical block overview, part X/Y
positioning, exact endpoint selectors, staged wire removal/reconnection and draft
JSON import/export. Applying constructs and initializes a fresh board before
replacing the current session; an invalid draft leaves the previous board intact.
Close discards unapplied changes; successfully applied layout is retained when
reopening the draft. Connections are drawn between block centers with exact pin
names in the wire selector, **not physical package-pin or breadboard geometry**.

Remaining: production Circuit Editor integration and richer routing/placement. No
new CPU package symbol, palette entry, production solver model or arbitrary
80286 board support is claimed by this conversion layer.

Visual follow-up verification: the isolated Chromium gate passed positioning,
draft import/export, discard versus applied layout persistence, electrical
failure preserving the old board, reconnection and fresh guest execution. No
new full-app acceptance is inferred from that isolated test. Policy, lab/draft,
DOS readiness and existing diagnostics tests passed 39/39 across two local runs;
the pin audit included all three repositories' histories, with no skips.
