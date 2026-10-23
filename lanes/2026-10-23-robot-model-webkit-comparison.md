# Bounded Robot Lab WebKit environment comparison

CLAIMED — qualification-only follow-on to the published model repair #1281.
Codex, owner-authorized continuation, 2026-10-23. Isolated branch
`lane/robot-model-webkit-comparison-20261023`; base
`75f37012e9f47bdb803227fae1575b7f7eeff703`.

Own `.github/workflows/robot-model-webkit-comparison.yml`, the isolated
`scripts/qualify-robot-model-webkit.mjs` consumer, its focused tests and this
claim. This expands qualification plumbing only; the existing model repair
owner retains #1281 and other lanes retain their scopes.

Compare the already published candidate in a recorded supported hosted Ubuntu
WebKit environment. Consume one admitted existing official frontend artifact;
never rebuild the frontend or relabel a different checkout as the candidate.
Bind repository, event, immutable head, producer job, actual checkout/tree,
artifact digest and built source identity before running the actual existing
browser program and mechanical acceptance checks. Record runner resources,
Node/Playwright/WebKit identities and complete original outputs. Reserve and
retain each official original once, with independent readers.

Preserve the failed original runs. Keep the existing 324-second wait and
100-second Quartermaster simulation requirement, viewport, renderer launch,
physical assertions, model bytes, compiler, solver and dependency pins intact.
Do not convert a later warm pass into cold or performance qualification. If the
new environment still fails, retain the failure and profile the observed step
and rendering bottleneck; a production behavior repair requires separate
explicit scope before implementation.

Before landing: merged claim, focused admission/refusal controls and source
binding, one bounded actual hosted comparison, affected qualification and all
enabled exact-head checks. Use a normal matched-head merge and verify predicted
and landed trees and parents. No release, hardware or physical-accuracy claim.
