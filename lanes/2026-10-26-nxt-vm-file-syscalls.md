# NXT VM file system calls

Status: DONE — qualified source landed through #1430.
Owner: Codex Robot Lab continuation.
Base: `5cd027707eceed3451bd62eaa21125a051650e59`.

Before this candidate, NXT telegram file commands used bounded virtual flash,
but compiled programs stopped on FileOpenRead, FileOpenWrite, FileOpenAppend, FileRead,
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

The claim landed in #1427 before implementation. This candidate implements the
ten calls with bounded data-file capacity, binary buffers, append, rename/list
ordering, program-only resolve/retirement and JSON snapshot state. Fixed telegram
uploads preserve their complete-without-overflow close rule. Unsupported calls
continue to stop with their names. The virtual active image does not consume a
loader handle, and physical flash pages/timing are outside this model.

Validation before publication: 19 pure backend/interface/allocation/ownership
controls pass; seven targeted mutations are detected without editing the product
files or executing a guest. The one hosted compiler response binds the owned NXC
source and 2,994-byte RXE. Four hosted-only fixture controls cover source identity,
normal completion, Stop/restart and deterministic snapshot completion. Actual
guest execution and every enabled exact-head check were mandatory before merge
and were subsequently satisfied as recorded below; local controls and static
review alone provided no guest qualification credit.

The source subsequently qualified on the immutable final head: all 83 affected
hosted tests across ten files passed, with the six official unit artifacts
accepted by independent retained-original readers. All 40 exact-head checks
finished with 33 successes and seven declared conditional skips, with no legacy
status contexts. The normal matched-head merge landed as `2f3ba1fa`; actual
parents and tree equalled the prediction, preserving the current main additions.
This qualifies the named virtual-file and runtime cases, not physical flash,
hardware timing or broad NXC compatibility.
