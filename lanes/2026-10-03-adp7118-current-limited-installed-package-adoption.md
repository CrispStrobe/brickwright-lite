ADP7118 current-limited installed package adoption — **DONE candidate 2026-10-03**, Codex
Codex, isolated `<owned checkout>`,
branch `lane/adp7118-limiter-package-adoption-20261003`, exact base
`4fd860e6bb0e76d849053d916b94bb4257aedab2`. Own Board package boundary only:
adopt qualified upstream `8eb5cf13013e49a6602fadc5077920efee144ba7`, retaining
CUI6471bf44 and all other pins. Scope: this paragraph; vendor-pins.json and
derived root/GUI package specifications/locks; generated package notices,
Board census, 8086/matrix reports and controller/ROM provenance mirrors only
where pin-stale; scripts/verify-circuit-rendering.mjs; existing
test/adp7118-package-adoption.test.mjs plus new
test/adp7118-limiter-package-adoption.test.mjs; the other four physical-part
adoption tests' exact Board pin assertions only. Board range changes only
src/devices.js, src/devices/power.js and src/mna.js; nonlinear primitive,
lead admission and selected current-limited RC model are upstream-owned.
Prove installed scope/meter waveform, current ceiling and simultaneous VIN/KCL,
real bundled browser overload/inrush and source-refusal boundary. Keep legacy
DC/startup controls. No source copy/fork, other pin, solver/tolerance/budget,
workflow, corpus payload or unrelated GUI edit. Exact upstream CI37099345521
and Harris37099345517 green. Installed adoption: 18/18 focused tests, 120 CLI
samples each; overload/inrush maximum analytic errors 67.548/1.716 microvolts,
window-mean errors -10.202/-2.352 microvolts, 211/225 accepted-step current/KCL
checks; zero-sum stale-VIN mutation red. Exact npm-pack source identity:
7759 Board and 1301 CUI files; ROM/controller payloads unchanged. Pin/provenance
suite 53 pass/2 explicit history skips before source checkout configuration;
history-enabled rerun 19/19 without skips; mirror gate green and all eight
generator checks current. Browser gate adds actual bundled overload,
inrush and source-refusal checks (not an instrument-pixels certificate).
Canonical claim 3fea37d16 preceded implementation. Build37101075614 at2a9c5d719:
5396 unit passes/0 failures/15 skips, corpus/heavy browser/FPGA green; light
browser RED in the two new capture checks. The harness incorrectly applied
finite-series-source bulk-acquisition bounds to ideal-source partitioned
advances (overload max100.159/mean38.714 microvolts; inrush max65.648).
Forward evidence-only repair matches the qualified CLI's 4-ohm source fixture
and bulk capture protocol, separately retaining 120 partitioned current/KCL,
finite VIN drop and upstream partition-waveform bounds. Original capture
bounds and all model/solver bytes unchanged; the ideal-source numerical
discrepancy remains recorded, not claimed fixed. Fresh qualification and
guarded landing pending; Pages/Vercel publication verified separately.
