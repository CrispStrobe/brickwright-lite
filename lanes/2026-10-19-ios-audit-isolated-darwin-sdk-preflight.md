## iOS audit: isolated Darwin SDK preflight — 2026-10-19

The existing optional unsigned audit scope now includes a default-off
`ios_audit_preflight_only` dispatch mode in the same workflow. It requires input
retention, the owned source branch and both signing/device flags off. Its separate
read-only-permission Mac job uses an explicitly pinned setup-python action for
Python 3.13 and compiles one tiny SDK probe. Preflight mode skips the web build;
all existing app jobs depend on that build, so no app, signing or delivery runs.
Ordinary dispatches and tags retain their existing behavior.

The probe checks actual SDK structure offsets, library calls, timebase ratio and
one parent-owned process against the workflow sampler. It verifies non-reaping
wait, group cleanup before reaping, and refusal after exit. The bounded structured
report binds workflow, producer, probe source/executable, SDK settings and compiler
version identities. The executable and runner path are not uploaded; pidpath keeps
only its buffer hash/size. This is platform admission, not an installed-app map,
process-family census, exec-generation, simulator or physical-device result.
No simulator runtime is downloaded or started by this mode. Actual platform
results must be reviewed before any observation-controller wiring or admission.
