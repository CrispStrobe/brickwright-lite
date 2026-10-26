# NXT VM file system calls

Status: CLAIMED — user-authorized follow-on after #1415.
Owner: Codex Robot Lab continuation.
Base: `5cd027707eceed3451bd62eaa21125a051650e59`.

NXT telegram file commands already use bounded virtual flash, but compiled
programs still stop on FileOpenRead, FileOpenWrite, FileOpenAppend, FileRead,
FileWrite, FileClose, FileResolveHandle, FileRename, FileDelete and ListFiles.
Implement the standard firmware file-call subset from independently described,
cited ABI/status/loader facts. Keep other unsupported calls refused by name.

Own only `overlay/scratch-gui/src/lib/bw-sim/routes/nxt-vm/` file-call dispatch
and narrowly necessary data-buffer helpers; virtual file operations and VM I/O
hooks in `overlay/scratch-gui/src/lib/bw-sim/hubs/nxt/`; focused NXT VM, virtual
brick and file-store tests; owned NXC/compiler fixtures and their README under
`test/fixtures/nxt-rxe/`; the corresponding NXT VM and Robot Lab handoff
paragraphs in `docs/NXT-RXE-VM.md` and `docs/ROBOT-LAB-AGENT-HANDOFF.md`; and this
claim. Respect shared source ownership and canonical mirror rules.

Preserve existing system-command wire layouts/statuses, flash and handle caps,
program loading, deterministic snapshot/reset/stop behavior and current VM
allocation/work limits. File calls reach virtual state only. No host filesystem,
network, physical storage, IO-map, Bluetooth, engine, physics, model registry,
shared pane, dependency pin, workflow, API configuration, token or ledger change.
Do not copy firmware implementation or relax existing assertions or budgets.

Merge this claim before implementation. Record verified facts and unverified
boundaries. Use focused positive/error/alias/bounds/lifecycle controls with
meaningful negative or mutation checks. Compile owned NXC fixtures once using
the existing pinned hosted compiler; retain originals and never compile in tests.
Require fresh clean affected hosted virtual-brick qualification, independent
retained-original readers, every enabled exact-head check and normal matched-head
merge with reviewed/predicted/landed tree and parents equal. No physical firmware,
hardware timing or broad NXC compatibility claim follows from these cases.
