# Robot Lab qualification: line-ending-safe physical source checks

Status: IMPLEMENTED CANDIDATE, hosted qualification pending.
Owner: Codex Robot Lab continuation, user-authorized ordered follow-up.
Branch: `lane/robot-crlf-qualification-20261028`.

The preceding hubless harness change landed in #1496. This narrow successor
fixes CRLF physical-disconnection parsing. Inspection found the existing
JavaScript multiline author assertion already accepts CRLF; it stays unchanged.
Model-building lanes retain their judge registrations and models.

Own a new engine-free source-text helper under `scripts/lib/`, its focused
test, only the line-ending handling in `disconnectedSource` in
`scripts/lib/robot-lab-qualification.mjs`, and the author-line check in
`test/bw-sim-qualification.test.mjs`. Also own the corresponding line-ending
paragraph in `docs/ROBOT-LAB-QUALIFICATION-HANDOFF-20261028.md` and this claim.
Expand the runner scope only if an actual matching boundary needs the helper.

Preserve original bytes and provenance hashes, exact duplicate/missing-part
refusals, all judges, model contracts, physical bounds and existing assertions.
No model/program edits or promotions, dependency/pin, solver, production GUI,
workflow, budget or unrelated harness change. LF and CRLF must select the same
physical records; a CRLF boundary must never retain a supposedly removed part.

Merge this claim before implementation. Prove LF/CRLF equivalence, mixed
boundaries, terminal records, duplicate and absent IDs, misleading prefixes and
author attribution failures with meaningful negative controls. Require fresh
affected clean hosted qualification and unchanged existing verdicts, every
enabled exact-head check, declared skips only, normal matched-head merge and
predicted/landed tree and parent verification. Keep originals once, private
evidence private, and the final status honest about experimental models.
