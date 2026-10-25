## SPIKE Linux package hosted exercise — 2026-10-25

CLAIMED — Lite packaging CI, branch `lane/spike-linux-package-ci-20261025`,
base current `main`. Claim and implementation in one PR.
Envelope: this file, new `.github/workflows/spike-linux-package.yml`, new
`scripts/ci-spike-linux-package-exercise.mjs`, the "Hosted packaging exercise"
section of `docs/SPIKE-LINUX-DESKTOP.md`, and the census entries for the new
workflow (`docs/generated/ci-step-census.json`, `CI-POINTERS.md`).
Closes the G05 open item "no hosted workflow runs the builder". The job runs the
unchanged builder on a hosted runner, compiles and packages, installs the .deb
under a normal dpkg policy and runs the installed-layout check.
Runtime, support profile and frontend are labelled placeholders, because no
public producer publishes them at a pinned digest. No firmware, no package upload.
No change to the builder, gates, pins or other workflows. No claim that the app
runs, and no redistribution or release claim.
