## Production service-worker probe (#306) and example part-face census — 2026-10-18

CLAIMED — Claude (circuit-editor lane). New files only:
`scripts/probe-production-sw.mjs` and `.github/workflows/production-sw-probe.yml`
(workflow_dispatch plus workflow_run after the production deploys). Stage `seed`
loads a live site in a persistent Chromium profile and uploads it as an
artifact; stage `check` restores that profile after a newer deploy, reloads,
opens the lazy pseudocode importer and fails if any chunk fails to load or
the importer chunk differs from the network copy. Targets: GitHub Pages and
Vercel production. And `scripts/census-example-faces.mjs` run by the same new workflow:
it loads every examples/*/circuit*.json in the circuit editor and lists parts
drawn by the bw-circuit-ui generic module body (report, not a gate). No
product source, pins or existing workflows change.
