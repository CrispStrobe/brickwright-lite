# Private assessment child-tree supervisor

`scripts/private-assessment/supervise.py` is a finite Linux host supervisor.
It is a process controller, not a namespace, credential, RAM, disk-quota or
network sandbox. Actual bubblewrap isolation and provider admission require
separate qualification. No local conversion or assessment count follows from
its subprocess controls.

## Private command interface

Use the exact `/usr/bin/python3`, whose standard library must expose both
`os.pidfd_open` and `signal.pidfd_send_signal`:

```text
/usr/bin/python3 scripts/private-assessment/supervise.py --spec private-spec.json
```

The spec is bounded regular UTF-8 JSON, at most 64 KiB, with duplicate keys,
nonfinite constants and unknown schema keys rejected. It has exactly:

- `argv`: nonempty trusted private argument array, at most 256 strings. The
  first names an absolute executable. No shell is used. Arguments must be
  supplied by the admitted controller, never by a corpus manifest.
- `cwd`: existing normalized absolute directory without symlink ancestors.
- `outputRoot`: fresh normalized absolute directory under real directories.
- Optional `limits`: only the lower bounds below; no hosted selector or
  arbitrary environment mapping is accepted.

The child receives only fixed PATH, LANG, LC_ALL, TZ and fresh private HOME and
TMPDIR values. This does not erase secrets previously inherited by the
supervisor or hide host files. Its caller must launch it with a clean admitted
environment; the separately qualified sandbox supplies filesystem isolation.
The actual command and all dependency executables require external source and
provider guards. The supervisor does not authenticate a supplied executable.

## Fixed qualification envelope

| Limit | Maximum |
| --- | --- |
| Aggregate observed CPU, including supervisor | 25 seconds |
| TERM / KILL / terminal wall deadlines | 30 / 33 / 35 seconds |
| Inherited hard address space | 16 GiB per process |
| Inherited hard file size | 8 MiB per file |
| Owned output including reserved result/capture copies | 64 MiB |
| Output entries including empty directories | 4096 |

Optional numeric values may only lower maxima; deadlines must remain ordered.
CPU cannot be lowered below 0.1 seconds, file size below 4096 bytes or owned
output below 2 MiB. Output capacity must also exceed a 1 MiB result reserve
plus three per-file limits, conservatively reserving transient retained-stream
copies. These reservations can reject input below the nominal aggregate maximum. The controller
separately admits a Node command with its 512 MiB heap setting. Address space
and Node heap are not an aggregate resident-memory limit. Inherited per-process
RLIMIT_CPU is defense in depth, not the aggregate counter.

The proposed hosted 600 CPU / 900 TERM / 903 KILL / 905 terminal profile is
not selectable here. It requires a separate admitted hosted source/controller
contract. No caller can raise local maxima to approximate it.

Wall deadlines begin during supervisor construction; an outer watchdog must
bound complete startup, result writing and the entire caller operation. CPU
measurement includes interpreter/setup self usage, then measures again after
terminal output hashing and before result serialization/write. The outer
watchdog covers that final remainder.

## Ownership, adoption and CPU partition

A fresh standalone supervisor requires no existing children, sets and reads
back `PR_SET_CHILD_SUBREAPER`, then directly forks and execs the command. No
Docker daemon or external process launcher is used. It tracks actual descendants
through every owned task's proc children list and newly adopted direct children.
Session and process-group changes do not remove ownership.

Pidfds are admitted and retained when an actual owned parent/child edge is
verified on both sides, including parent-handle liveness and PID/starttime.
Signals use those retained kernel handles. They never reopen a historical PID
when cleanup is needed, even after an unstable observation. There is no fallback
to PID-only or group signaling. Terminal requires
both `ECHILD` from draining wait4 and an empty owned closure. Original root
exit code/signal and all terminal child receipts are retained separately from
failure and cleanup reasons. A zero root exit does not imply an empty tree.

For live observations, a process contributes its own proc CPU plus already
waited-child CPU. Two tree/stat passes must agree on membership, parentage,
starttimes and child counters; unstable samples are discarded. Terminal wait4
receipts replace their reaped processes and waited descendants. Live estimates
are never added again to final receipts. Tick rounding has a conservative
reserve. Persistent accounting uncertainty fails closed.

**Coverage limitation:** subreaping and polling cannot recover an entirely
unseen child autoreaped under SIGCHLD-ignore or SA_NOCLDWAIT. The actual admitted
bwrap/Node executable graph must have an independently supported wait/reap
contract. Every result states this limitation and sets `arbitraryGraphExact`
false. Neither successful synthetic controls nor an outer bwrap wait4 alone
proves exact CPU for arbitrary executables. An unproved graph requires an
independently admitted kernel counter, not a guessed adjustment.

CPU, output and ownership failures trigger TERM then prompt KILL of verified
owned handles. Wall expiry uses the ordered TERM/KILL deadlines. Discovery and
reaping continue after the original parent exits. Deadline expiry produces an
incomplete failure; it never extends the deadline. Supervisor SIGKILL cannot
promise cleanup, so the outer owned-tree watchdog remains required. The finite
process/handle and output-node inventory bounds are not kernel quotas. Proc stat
parsing treats the command name as arbitrary bytes and decodes only its numeric
tail, so non-ASCII process names do not escape cleanup.

## Original outputs and result

The supervisor preopens exclusive no-follow stdout.bin and stderr.bin as private
0600 regular files. Root and owned directories are 0700. Collection traverses held root/directory descriptors with fd-relative no-follow
operations, counting directories and files. It rejects symlinks, devices, hard
links, changed identities and nonprivate modes. A held O_PATH file descriptor
is type-checked before its trusted kernel `/proc/self/fd` view is opened for
bounded reading; caller symlinks are never followed. Identity and size are
rechecked. Original stdout/stderr descriptors remain held through terminal
collection. Replaced/unlinked names fail and their original bytes are copied
from those held descriptors into fresh private retained leaves, then content
hashes are joined to the collected copies. No replacement is called original.
The three-file transient reserve counts copies within the aggregate envelope.
All files and copies count toward output bounds; the reserved result is written
exclusively as result.json. No file is deleted or truncated to manufacture fit.
An output-limit failure preserves the actual prefix written before termination.

Polling can overshoot an aggregate output bound; it is not a hard disk quota.
Final checks refuse that result. Concurrent hostile host mutation is outside
this controller's isolation claim and must also fail external guards. Result
JSON is private and contains child identities, original statuses, receipts,
signals, reasons, resource observations and output hashes. Do not publish it or
raw output. Setup errors expose only a fixed refusal message.

The complete ordinary Node test module invokes actual finite Python children
under lower deadlines. It covers original output/exit, detached late adoption,
waited-grandchild CPU, aggregate CPU termination, TERM/KILL, real file-size
signals, aggregate output, original-stream replacement retention, non-ASCII
comm cleanup, empty-directory bounds and symlink/schema refusal. It uses no bubblewrap,
mount, namespace, administrative operation, device, credential or real corpus.
The whole module remains subject to the root's existing 25 CPU envelope.

Control fixtures intentionally retain their finite `private-supervisor-` tree
under the caller-owned TMPDIR, including all specs, original stdout/stderr and
results from successful and failed operations. There is no automatic recursive
teardown and no private path logging. The outer controller inventories and
bounds that complete tree for independent saved-data review.

## Observed qualification

The complete seven-group module passes with no skips. Independent saved-data
review checked all 12 launched subprocess results, including terminal ECHILD,
empty remaining-child inventories, original outputs and receipt partitions.
The outer wrapper then rejected its saved result because it retained an
incorrect expected count of eight from another module. That observer error is
preserved; the passing producer was not rerun. The source module has seven
groups and the independent reader admitted all seven. This qualifies the
source-admitted Python control graph; bubblewrap, provider and full-corpus
acceptance remain separate.
