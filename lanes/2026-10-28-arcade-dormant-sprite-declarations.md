# Dormant Sprite local and return declaration fidelity

Status: CLAIMED; implementation waits for canonical registration on main.
Owner: Arcade dormant-declaration repair in an isolated branch.
Registration base: main `cb28becdb16`.
Source continuation base: typed-bitwise checkpoint `2b50a37cffc` on the existing
Arcade integration source. This registration does not land that source stack.

## Ownership and exclusions

The operator instructed this worker to continue coding after the two specific
dormant Sprite local/return repairs were proposed for takeover. This records
that narrow operator-authorized scope; it does not claim an acknowledgment or
release by the broader integration owner. Preserve the existing forward-fix and
accessor/Sprite integration claims, source, branches and qualification custody.
The parameter repair remains frozen at its separate checkpoint pending external
qualification. Do not push or supersede the integration branch.

## Reproduced failures

These sources import and export without a diagnostic, but exported TypeScript
loses the declaration needed to reimport the flags expression:

```ts
function returned(): Sprite { return null }
function unusedReturn() {
    return returned().flags & SpriteFlag.StayInScreen
}
let ready = 1
```

```ts
function unusedLocal() {
    let actor: Sprite = null
    return actor.flags & SpriteFlag.StayInScreen
}
let ready = 1
```

The exported result/local becomes `any`; reimport then refuses the bitwise
operand. These are source observations, not identification or closure of the
separate retained declared-reference runtime failure.

## Implementation envelope

Own only declaration reconstruction for these otherwise-untyped dormant
ordinary-procedure locals/results in
`overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js` and a necessary
adjacent dormant-declaration proof helper. Own a new focused
`test/arcade-dormant-sprite-declarations.test.mjs`, its exact GUI scope row,
this claim and `docs/ARCADE-AGENT-HANDOFF.md`.

Use the existing current closed ordinary-entry proof. Audit actual physical
reads, writes, callers, returns and lexical bindings before selecting a
compatible declaration. The complete affected local/callee closure must remain
dormant. Null is a compatible reference initializer, not an initialized Sprite
producer. Keep all original explicit constraints and evaluation effects; reject
incompatible declarations rather than silently overriding them. Do not infer
Sprite authority from a helper name, annotation, flags spelling alone, retained
source or an empty writer set. A later caller, writer, alias, escape, shadowing
or graph edit must revoke the declaration plan.

Do not populate the live producer graph or extend Number/Sprite/Array/runtime
admission. Do not change supplier pins, runtime services, workflows, budgets,
existing acceptance tests, baselines or diagnostics to conceal a failure.
General editor controls and serialization for arbitrary reference annotations
remain a separately scoped capability.

## Qualification and delivery

Cover both export APIs, Code rebuild, repeated exported-file reimports and SB3
reopen. Preserve actual local initialization and function returns. Include
reachable/unknown callers, non-null incompatible writers/returns, aliases,
multiple consumers, lexical collisions, graph edits and declaration conflicts.
Remove each actual repair and require a meaningful regression failure; restore
exact source bytes. Source controls cannot close a corpus row.

Run the unchanged original-PXT/native typed-bitwise and declared-reference
acceptance controls with Node 22, locked integrated dependencies, the pinned
synced Arcade runtime and Playwright Chromium on an external qualified worker.
Missing inputs remain unavailable qualification. Preserve original failures
and acquire each official original once. No heavy builds or suites on the
shared server, duplicate dispatches or full-CI labels without an actual need.
Deliver normal checkpoint pushes for integration-owner composition. Require all
enabled final-head checks and reviewed/landed tree and parent verification before
landing source. Registration itself is Markdown only, not runtime qualification.
