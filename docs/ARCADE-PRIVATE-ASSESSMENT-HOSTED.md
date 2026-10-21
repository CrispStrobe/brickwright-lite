# Public hosted isolation qualification — SOURCE candidate

Kernel qualification and the manual workflow are **unexecuted and unqualified**. They
admit public synthetic data only. There is no converter, private corpus,
credential acquisition, sealing/upload of private bytes, or LIVE entry. The
historical first tmpfs EPERM and every earlier SOURCE hold remain original;
this candidate does not change local supervisor limits or infer a kernel pass.

The two complete ordinary test modules pass **10 tests, zero failures, skips
or TODOs**. They exercise schema/policy, actual local no-follow collection and
the finite storage/accounting contract. Python starts with `-I -S -B`, so
unrelated installed site hooks cannot enter these controls. The original
intentional FIFO and link fixtures are retained as metadata, never byte reads.
These results do not qualify any of the nine hosted kernel controls, an image
or tool profile, private input delivery or the eventual corpus assessment.

## Register the manual workflow before candidate qualification

GitHub requires a `workflow_dispatch` workflow on the default branch before a
manual dispatch, and supports selecting a different branch with `--ref`.
See [GitHub manual workflow documentation](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow?tool=cli).
A new workflow only on a candidate branch does not meet that prerequisite.

First land a separate registration-only change at this same workflow path:
manual trigger, finite input choices, read-only contents permission and a
harmless fixed status job. It must contain no privileged setup, controller
execution, arbitrary command/ref executor or private-input capability. Normal
exact-head source checks qualify that registration behavior only. This does
not merge or qualify the kernel implementation. Do not repurpose another
lane's existing manual workflow.

After registration, manually select the reviewed candidate branch. Its actual
workflow/run head and checked-out `github.sha` must equal the frozen source
selection. Collect public metadata first, independently review the official
original, then admit the exact observed image/tool profile in a source-reviewed
successor. Manually qualify the entire fixed nine controls against that exact
successor. Kernel implementation merge still requires the original actual
qualification and independent DATA admission. There is no automatic PR kernel
run or new human approval requirement. The candidate workflow in this change
remains functional and manual-only; the registration-only change is separate.

## Two manual operations

The workflow is
[arcade-private-assessment.yml](../.github/workflows/arcade-private-assessment.yml).
It has only `workflow_dispatch`, no automatic PR run or additional full CI label.
The pinned checkout selects the actual workflow SHA with credential persistence
disabled. Controller environment is an explicit `env -i` whitelist. No secrets,
GitHub token, event file, user home, agent socket or Docker socket is passed to
the qualifier or payload. Normal configured repository policies still apply;
this introduces no required reviewer or approval workflow.

1. **metadata-probe** is unprivileged. It reads only finite public platform,
   package-status, Python/bwrap file, and four controller/policy source records.
   It executes no external tool, privilege setup, mount, namespace or cgroup
   operation. It retains a bounded public JSON artifact. Missing bwrap is a
   recorded unavailable tool, never an isolation result.
2. **qualify-public** requires a source-admitted profile in
   [hosted-public-tools.json](../scripts/private-assessment/hosted-public-tools.json).
   The profile must exactly match the actual Ubuntu image version, kernel,
   architecture, installed package identities and both complete executable
   hashes/paths/ownership/modes. The initial policy deliberately has **no
   admitted profiles**. Unknown or missing tools refuse before privileged
   setup. Source review of one official metadata original can add an exact
   profile; do not invent hashes, copy the runtime observation into approval,
   download a replacement, or enable a fallback.

Environment image strings are observations, not official-origin attestation.
Independent delivery review must bind the actual owned run/job/step/artifact,
checkout SHA, source bodies, runner and tool observations. Initial metadata
collection and a later qualified source selection are different operations;
there is no unchanged kernel replay to read evidence.

## Owned global resource envelope

The outer controller is
[hosted-public-outer.py](../scripts/private-assessment/hosted-public-outer.py).
After tool/source admission it creates one fresh owned cgroup-v2 episode and a
controller child group. It never enables controllers in the host root or edits
sysctl, AppArmor or other global policy. Unavailable delegation is failure.
The episode has one CPU rate, 512 MiB memory, zero swap and 64 tasks. Limits are
read back from the kernel. Qualifier membership precedes exec; a retained
cgroup directory FD and actual owner/type/inode/membership checks select the
case-parent seam. Every original case creates its own cgroups **below** that
episode. The FD becomes noninheritable and no bootstrap FD reaches bwrap.

The global cumulative value is the episode's actual `cpu.stat`, the outer's
own process CPU including interpreter/import startup, and a fixed eight-byte
trusted launch receipt. The fork child records its actual self CPU immediately
after confirming cgroup membership, before exec, over a private close-on-exec
pipe. Thus fork/preexec CPU outside the episode is included; the small portion
between membership and the receipt is counted conservatively twice. The parent
validates the complete finite receipt before grading. Successful `wait4` CPU is
retained only as a diagnostic and is not added again. A failed launch without a
valid receipt retains the actual cumulative reaped-child usage delta as a
conservative failure-only upper bound; it cannot pass. Detached and autoreaped
payload children remain included in the kernel counter. Linux process birth ticks and boot-time clock include
startup in the owning wall deadline. This public cohort keeps 25 CPU seconds,
TERM30/KILL33/terminal35, 8 MiB leaves and 64 MiB owned bytes; it does not select
the proposed 600/900-second LIVE budget. A small stop reserve, kernel limits and
final counters can reject overshoot; delayed scheduling never becomes success.
The workflow's five-minute job limit includes checkout/setup and is a final
hosted backstop, not a substitute for the owning episode's terminal evidence.

The outer owns a 24 MiB/2048-inode data tmpfs and 1 MiB/16-inode stream tmpfs.
Each of nine original cases can own at most another 64 KiB scratch and 256 KiB
capture tmpfs, with their original inode and per-file limits. All originals
plus regular artifact copies are below 56 MiB before the unchanged 1.9 MB
reserve and bounded metadata; actual final aggregate and leaf checks still
apply. Tmpfs magic, capacity and inode limits are read back. This is a public
synthetic storage contract, **not** a demonstrated converter fit or a generic
filesystem quota for arbitrary workloads.

## Original isolation and complete controls

[hosted-run.py](../scripts/private-assessment/hosted-run.py) still provides the
fixed public probes. Bwrap uses an empty private root and explicit read-only
interpreter/stdlib/system-library/source/input binds, never a host-root bind.
Host `/etc`, `/home`, `/run`, cgroup filesystem, workspace parents, credentials,
Actions files and host proc are absent. Proc belongs to the new PID namespace;
proc/dev/root are read-only. Only bounded scratch is path-writable. Host UID
65534 and inside UID1000, empty groups, zero capabilities, no-new-privileges,
network/Unix/host-file absence, FD inventory and namespace syscall refusals
must be observed. Trusted OS libraries remain a declared runner-image boundary;
there is no complete hash census of every system library or hostile-kernel claim.

The complete nine cases remain mandatory, without filters or skips:

- Actual nonroot/namespace/credential/network/read-only boundary, with genuine
  host and dropped-host-UID positive markers.
- Real byte ENOSPC, inode ENOSPC and per-file EFBIG controls.
- Real pids EAGAIN with kernel event.
- Completed detached child CPU plus actual SIGCHLD-ignore/ECHILD and final
  kernel accounting, while the parent uses little CPU.
- A different detached child alone burns CPU while the parent sleeps; actual
  child CPU/parent ticks must reach the original CPU limit before TERM/KILL.
- Actual ignored TERM followed by KILL.
- Symlink/FIFO collection refusal without opening either for reading.

The unchanged assertions live in
[qualify-hosted.py](../scripts/private-assessment/qualify-hosted.py).
Only the trusted episode-parent plumbing changes their setup. The original
schema/local-file module has three groups; the new outer policy/local collector
module has seven. These ordinary ten groups establish **no kernel isolation**.
Only the entire explicit real nine-case hosted cohort can qualify the candidate.
Missing tools or privilege support cannot be converted into empty passes.

## Failure originals and cleanup

The outer pins the direct child with a pidfd and terminates only its owned
cgroup subtree. Positive admission requires qualifier exit0, all nine case
records, no resource/errors, actual cgroup populated=0 and wait closure ECHILD.
The episode must already be empty at original qualifier success, before any
cleanup action. An originally populated episode is recorded as failure even if
owned cleanup later kills and drains it successfully. Nonzero exit and original
errno/traceback stay failed. A successful prefix does
not qualify the cohort.

After writer closure, finite O_PATH/type-checked collection copies complete
regular bytes before unmount, retaining inode/type/hash metadata. Links, FIFOs
and the deliberately retained public Unix socket are metadata only; none is
opened for a byte read. Failed writer closure retains held-stream prefixes
explicitly marked incomplete and leaves unsafe mounts for the owning runner's
cleanup; it never grades those bytes as a complete result. Cleanup errors and
incomplete termination are artifacts. No other worker's group or mount may be
killed, removed or normalized.

Only safe regular copies and JSON are uploaded; the workflow never uploads the
live `volatile` filesystem. Public original copies are deliberately readable by
the upload step; they contain public synthetic data only. Any later private
workflow must use the separate reviewed sealing path and ciphertext-only output.
A final source/tool check and post-serialization bound can still refuse. DATA
acceptance requires the actual outer exit/status as well as its JSON; a saved
optimistic field is not process authority.

Normal provider/input admission, actual converter arguments, all225 ordered
observations, encryption, official artifact delivery and private independent
reading remain separate work. This SOURCE candidate has executed none of them.

The admitted kernel's hierarchical `pids.events` behavior remains an explicit
pre-execution compatibility question: the intentional inner pids-limit control
must not be confused with exhaustion of the outer 64-task limit. No runtime
compatibility or absence of hierarchical propagation is established by SOURCE
review. The current fail-closed event check has not been relaxed.
