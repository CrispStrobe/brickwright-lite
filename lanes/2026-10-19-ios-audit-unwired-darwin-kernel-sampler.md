## iOS audit: unwired Darwin kernel sampler — 2026-10-19

The existing owned workflow producer now defines a single-PID Darwin arm64
sampler using absolute system libraries and explicit ctypes signatures. Each
sample brackets the executable-path query with rusage-v0 observations. Nonzero
birth time and executable UUID must remain stable, exit must remain absent,
and user/system counters cannot regress. The returned identity digest is derived
from those kernel observations and the expected path; callers cannot supply it.
A matching path and UUID do not prove mapped code bytes or continuous identity.

Mach CPU counters are converted with the actual timebase ratio using integer
arithmetic. The sampled limits are 1 GiB RSS and five cumulative CPU seconds
since process birth, including time before the first sample. Observation is
cooperative, capped at 30 seconds and 100 samples; raw syscall records have a
1 MiB total budget and a 2048-record ceiling. Capacity is reserved before each
process syscall. Failed buffers and statuses remain available privately; records
are returned as copies. Stop, deadline, rollback and reentry refuse and seal the
sampler. It neither signals a process nor spawns a sampling command.

Thirteen authored kernel controls and five runtime mutations cover these source
contracts. Linux controls mock the Darwin API; they establish no actual Darwin
ABI, resource enforcement, process ownership, family census, exec-generation or
running-image join. SDK layout verification and actual kernel controls must
precede wiring. The workflow entry point remains unchanged and has no sampler
caller. Existing receipt qualification flags stay false and PR1078 stays draft.

The first broader source run retained 56 passes and one timeout-fixture error:
the child could be killed before writing its PID marker. That control now records
the real parent-owned Popen handle and still requires deadline refusal, terminal
status, kill and reap under the unchanged deadline. No process behavior is mocked
or timeout enlarged by this fixture correction.
