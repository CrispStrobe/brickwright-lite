# Bind the native qualification test interpreter explicitly

CLAIMED — Native qualification integration coordinator, isolated branch
`lane/native-qualification-test-interpreter-claim-20261023`, base
`6ed78045cb672acfd67271500a4eaf5ff9c82cb6`.

Own only `test/native-installed-qualification.test.mjs` and this claim. Supplement
the native producer qualification lane to replace its ambient `python3` lookup
with an explicit reviewed Ubuntu system interpreter binding. The producer's
generic unit shard detected this wrapper as a new AMBIENT-BINDING suspect;
preserve that failure and the unchanged gate-shape baseline.

Keep missing or unusable interpreters, failed Python controls, missing expected
test output, timeouts and nonzero exit status as hard failures. Preserve the
existing Python controls, native helper, request, workflow, dependency pins,
compiler, runtime behavior and qualification boundaries. This is test execution
binding only, without tool installation or a dependency version change.

After this docs-only claim merges, implement in the owned producer continuation.
Require focused wrapper/Python controls, nonvacuous missing or wrong-interpreter
refusal controls, the unchanged gate-shape scanner and exact-head hosted checks.
Do not raise a baseline, skip an enabled test, rerun unchanged source, or repeat
successful artifact acquisition or guest execution. Dedicated native artifact
and finite installed-guest evidence remain separate from whole-PR qualification.

No consumer, product, supplier, firmware, clock, timeout, acceptance threshold,
release, deployment, signing or hardware change is included in this claim.
