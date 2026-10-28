# x86 finite V10 resolver-kind inventory and current GUI acceptance

Owner: x86 coordinator. Status: UNARMED DRAFT [PR1540](https://github.com/CrispStrobe/brickwright-lite/pull/1540); execution disabled.
Initial base: Lite main `8acc3b962803e360a0c561c696d097839046c1ab`.
Current composition also preserves later Main changes.

## Problem and boundary

The superseded PR1318 finite V8 and V9 attempts observed different filesystem roles
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

## Required same-job execution boundary

A typed inventory alone cannot qualify the next runner: the hosted label does
not reserve a machine or freeze its configuration. Do not select a new finite
event on the assumption that its resolver bytes or role will transfer.

Introduce a distinct, initially disabled Actual-V9 route. Its prelude descriptor
binds the exact source, template, admitted Build, native reference and fixed
limits before setup. The same retained job then captures the V10 inventory,
finalizes an early immutable artifact, and waits for a separately audited
external admission. The independent phase reader must bind the in-progress
job, exact completed upload step and selected artifact; its result is not final
job or guest success.

The external controller publishes one unique immutable ACK Git ref carrying a
closed run/attempt/job/source/template/inventory/artifact/request binding. Use
an owned branch namespace with normal pushes; no personal credential enters
the job, no mutable-ref replacement and no new private binary publication.
The job polls only that exact contents-readable ref, validates the selected Git
objects and current PR marker, and installs the admitted request once using
the existing exclusive installation checks. Repository variables evaluated at
job start are not a live mailbox; do not assume the job token can read the
Variables API. Request bytes must be reachable by their selected Git identity.

Immediately re-observe the exact admitted runtime before guest entry and retain
the unchanged before/after identity assertions. The final independent reader
still requires terminal official success, genuine guest observations and finite
cleanup. The early and final artifacts have distinct roles and are each
acquired once. Keep Actual-V8 disabled with historical controls intact.

Preserve the 35-minute outer limit and both existing scenario caps. Propagate
one job deadline through setup, inventory, bounded external wait, request
installation, execution and cleanup. Refuse guest entry unless the remaining
budget covers both scenario caps and a fixed reviewed cleanup reserve. No
claim that the declared maxima fit follows from mock controls; source and
actual timing qualification remain required. Do not omit host configuration
or relax cross-job equality as a shortcut.

## Owned paths

Extend the existing PR1318 scope only in:

- `scripts/run-i80386-hdd-gui-actual.py` and
  `scripts/read-i80386-hdd-gui-originals.py`;
- `.github/workflows/i80386-hdd-gui-actual.yml`;
- `test/i80386-hdd-gui-actual.test.mjs`,
  `test/i80386-hdd-gui-browser-setup.test.mjs`,
  `test/pin-move-chain.test.mjs`;
- the owner-released frozen-study qualification repair in
  `test/reference-qualified-instrument-study.test.mjs` and the exact public
  package manifest `docs/receipts/reference-qualified-v2-ui-package.json`;
- `CI-POINTERS.md`, `docs/generated/ci-step-census.json`;
- this claim, `lanes/2026-10-27-x86-finite-v9-resolver-role.md`,
  `lanes/2026-10-25-x86-historical-cui-role-gate.md`;
- `docs/I80386-GUI.md`, `docs/X86-USER-PATHS.md`,
  `docs/X86-NEXT-LANES.md`.

Compose current main normally into the preserved source candidate, retaining
main's board pin and other owners' changes. No CPU, package, dependency pin,
lockfile, Build workflow, shared setup helper, guest media or product UI change.
If a separate helper module is necessary, extend this claim before adding it.

Use distinct V10 and Actual-V9 schemas, CLI, job, selection, transport, body
marker and artifact namespaces, plus the separately bound prelude and ACK. Retire V9 execution while retaining its historical schemas, strict
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

Then separately admit one new same-job Actual-V9 prelude and independently
read its V10 phase originals once before any ACK. Bind the native reference and
new actual request to that same job and inventory. Require actual FreeDOS HDD export/reload,
forward debugging, guest-rendered observations, independent reader and finite
cleanup. Merge source only after that affected acceptance and every enabled
final-head check succeeds; verify matched head, tree and parents. Keep all
original failures. Include stale/duplicate/wrong-job ACKs, incomplete upload, expired waiting,
request substitution/replay, post-ACK drift, inadequate remaining time and
unconditional cleanup controls. No whole-OS, physical timing, Windows or release claim follows
from a resolver metadata repair.

## Shared pin-policy integration

The circuit-study owner released the sealed historical-role and synthetic
collector-control repair from PR1538 for integration by this lane's pin-policy
owner. Import only that repair and the exact frozen public UI package manifest;
retain the x86 merge-history reader and versioned historical roles. Do not import
the unrelated package adoption or change any frozen study identity source.

Admit the three consumed-study source files and its package manifest only at
their exact reviewed complete-file hashes. Retain ordinary previous-pin and
never-pinned checks, and reject changed sealed bytes or the same stale value in
current code. Synthetic historical controls use an isolated consumer bound to
the original manifest; no original study is replayed or relabelled. The source
merge still requires every enabled final-head check and affected x86 acceptance.

## Published checkpoint and next action

Draft PR1540 at `4257afa4052c4b14667ac4c54f482b2cc0cb1c40` contains the
unarmed implementation and current-main composition. PR1318 is closed as
superseded; its branch, body and original failures are preserved. All new
execution/reader guards remain false. No actual guest result or merge is claimed.

The owner-released sealed study repair and isolated historical collector controls
pass 83 affected Node 22 tests with all three supplier histories. Connected
producer/reader controls, workflow isolation checks and merge-history regression
also pass. These are local source controls; hosted checks are pending.

Next: refresh PR1540 and all enabled checks on its exact head; preserve failures.
Complete and independently review the external phase-admission, request/ACK and
final-reader tooling before separately reviewing arming. Then admit the current
Build and native reference, perform the single new same-job acceptance and audit
its terminal result. Keep every qualification and merge condition above.
