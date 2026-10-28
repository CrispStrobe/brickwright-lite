# x86 finite V10 resolver-kind inventory and current GUI acceptance

Owner: x86 coordinator. Status: CLAIM ONLY; implementation and execution disabled.
Base: Lite main `8acc3b962803e360a0c561c696d097839046c1ab`.

## Problem and boundary

The pending PR1318 finite V8 and V9 attempts observed different filesystem roles
for the resolver on different hosted runners. V8 required an alias; V9 required
a regular file. Both attempts remain failed and consumed. Neither is retried,
renamed or reinterpreted as a positive observation.

Design a distinct V10 inventory profile with a closed, explicitly typed resolver
observation. Admit only the reviewed regular-file and symlink forms, with bounded
selected link text, target closure, no-follow reads and unchanged metadata checks.
Keep the resolver in the observed closure. Reject every unselected target, type,
missing endpoint, special file, excessive size, role overlap and before/after
change. The independent reader checks the selected branch from originals; it
must not import the producer or infer a positive result from a partial failure.
Before implementation, review how the new observation joins the later actual
job: a prior runner's configuration is not proof of a different runner's bytes.
Do not silently remove that identity requirement or promise cross-job stability.

## Owned paths

Extend the existing PR1318 scope only in:

- `scripts/run-i80386-hdd-gui-actual.py` and
  `scripts/read-i80386-hdd-gui-originals.py`;
- `.github/workflows/i80386-hdd-gui-actual.yml`;
- `test/i80386-hdd-gui-actual.test.mjs`,
  `test/i80386-hdd-gui-browser-setup.test.mjs`,
  `test/pin-move-chain.test.mjs`;
- `CI-POINTERS.md`, `docs/generated/ci-step-census.json`;
- this claim, `lanes/2026-10-27-x86-finite-v9-resolver-role.md`,
  `lanes/2026-10-25-x86-historical-cui-role-gate.md`;
- `docs/I80386-GUI.md`, `docs/X86-USER-PATHS.md`,
  `docs/X86-NEXT-LANES.md`.

Compose current main normally into the preserved source candidate, retaining
main's board pin and other owners' changes. No CPU, package, dependency pin,
lockfile, Build workflow, shared setup helper, guest media or product UI change.
If a separate helper module is necessary, extend this claim before adding it.

Use distinct V10 schemas, CLI, job, label, variables, body marker and artifact
namespace. Retire V9 execution while retaining its historical schemas, strict
reader and original failure. New execution guards start false; source arming and
actual selection require separate qualification. Keep existing time, memory,
archive, request-body and repository-variable limits. Never refresh historical
profile hashes automatically or weaken an assertion to pass.

## Qualification and done condition

Connected controls must exercise both admitted resolver forms and genuinely
reject role/target/byte/metadata races, incoherent or missing evidence, old
schema/event substitution and changed source/dependency identities. Preserve
positive ordinary behavior and historical negative controls. Review exact body
profiles before their narrow updates. Run all enabled final-head checks,
including the code tier, and admit the actual frontend Build checkout.

Then separately admit one new V10 inventory event and independently read its
originals once. Join the current runtime/native reference before selecting a
newly admitted actual GUI request. Require actual FreeDOS HDD export/reload,
forward debugging, guest-rendered observations, independent reader and finite
cleanup. Merge source only after that affected acceptance and every enabled
final-head check succeeds; verify matched head, tree and parents. Keep all
original failures. No whole-OS, physical timing, Windows or release claim follows
from a resolver metadata repair.
