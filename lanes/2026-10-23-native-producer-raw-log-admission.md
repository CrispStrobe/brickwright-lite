# Preserve original hosted native qualification log bytes

IMPLEMENTATION DONE (held producer candidate) — Native qualification integration coordinator; isolated producer
continuation `lane/native-qualified-main-producer-continuation-20261023`.

Own a narrowly scoped repair of the hosted qualification producer's raw job-log
acquisition in `scripts/native-installed-qualification.py`, with focused
`test/native-installed-qualification-controls.py` controls and this claim.
The first executable job for #1287 failed before source freezing or compilation:
the hosted GitHub CLI refused terminal escape sequences in the official frontend
job log. Preserve that failed event and original; do not retry unchanged source.

Permit the CLI's raw escape-sequence option only for the exact positive numeric
`actions/jobs/<id>/logs` endpoint. Capture its returned bytes without rendering,
stripping or rewriting them. Preserve default handling for JSON metadata and all
other endpoints, the complete consumer/run/ten-pin request, original artifact and
actual checkout identity checks, byte limits and refusal behavior. Add offline
argv, exact byte-preservation and no-retry controls, with meaningful negative cuts.

After this claim merges, make the source change only in the owned continuation;
publish one meaningful new producer head/event. Keep #1279 draft and the producer
stacked until source-bound installed acceptance and every enabled final-head
check qualify. Existing frontend originals are reused by independent readers;
no repeated diagnostic download or guest replay is authorized by this claim.

No runtime, firmware, pin, workflow, runner, compiler, timeout, clock, acceptance
threshold, JSON/tree/source gate or physical behavior change. Native compilation
remains hosted; private source/resource-bound installed qualification and all
existing holds remain mandatory. This supplements the merged native integration
claim only for this raw-log transport boundary.

The narrow implementation preserves original log bytes and metadata handling.
All 26 offline admission controls pass; four raw-log boundary mutations are
detected. Hosted executable compilation and installed acceptance remain pending.
