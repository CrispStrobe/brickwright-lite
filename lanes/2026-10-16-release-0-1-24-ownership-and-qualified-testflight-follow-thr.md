## Release 0.1.24 ownership and qualified TestFlight follow-through — 2026-10-16

CLAIMED — Codex release follow-through, branch
`docs/release-0.1.24-claim-20261016`, exact base
`27f473a738ff675db193ea689424f4ee3649910b`. Merge this ownership claim
before changing release metadata. The earlier `v0.1.23` tag is immutable;
its cancelled workflows are historical results, not a delivered new build.

Envelope after this claim merges: this ledger;
`apps/tauri/src-tauri/{tauri.conf.json,Cargo.toml,Cargo.lock}` for the three
aligned application versions; `docs/app-store-metadata.md` for current English
and German tester notes; operational creation of a new `v0.1.24` tag only on
the admitted qualified main merge, using the existing mobile/release workflows.
No product implementation, dependency pin, workflow, signing policy, transport,
physical-device mapping or hardware behavior change belongs in this lane.

Required prerequisites: retain merged WeDo adoption PR980 and its bounded
brightness/polarity/piezo claims, the merged iOS validator repair PR981 and its
independent actual native source binding. Review one combined release source
candidate for actual unsigned mobile qualification before advancing versions
or publishing; an older component build does not qualify newer frontend source.

Explicit dependency correction: PR982 repairs the separate local generated-
project helper, invoked by the local device-build npm hook. The existing
mobile/TestFlight workflows invoke the Tauri CLI directly and do not execute
that helper. Its actual generated-project qualification remains open in its
own lane; lack of that uncalled-helper result alone does not block this
release. Source CI or unsigned workflow success is not helper execution proof.
This correction changes no workflow, signing policy or qualification threshold.

Independently inspect the final source-bound unsigned app AND actual signed
IPA resource/content inventories, including unintended libapp.a or other
static archive packaging. Fresh project initialization and source checks do
not prove such archives absent. Retain actual compile, source/artifact,
signing, privacy, provisioning and icon checks. Preserve original failures and
exact identities; no old tag move or successful qualification replay. Broader
simulator and instrument candidates enter only after their own qualified
merges, with honest tester boundaries.

Release metadata must pass version/notes contracts and required exact-head
checks. Review actual main composition and predicted/landed tree/parents before
normal matched-head merges. Only then create the new tag. Completion requires
original signed build/upload, Internal and External group assignment and Beta
App Review receipts from the existing workflows. A queued workflow, unsigned
build or App Store submission is not a delivery or approval claim. Keep the
ordered five-task circuit campaign contract independent and unchanged.
