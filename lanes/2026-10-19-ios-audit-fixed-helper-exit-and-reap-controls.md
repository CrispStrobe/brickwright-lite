## iOS audit: fixed helper exit and reap controls — 2026-10-19

The third isolated platform preflight passed compilation, SDK layouts, executable
page checks, kernel identity and resource sampling, then failed with PermissionError
when signaling its exited unreaped group. Original failure/report remain retained.
The same claimed workflow now checks bounded before/after singleton group originals
and the same owned UID/PID/zero-exit WNOWAIT record before distinguishing this
fixed nonforking helper's zombie-only EPERM. Other or uncertain group results
refuse. A signaling failure cannot skip the owned reap; primary failures survive
reap errors. This is a tool-specific platform control, not an EPERM-success rule
for the general simulator command adapter. Process-group, process-family and app
qualification flags remain false, with separate actual cleanup admission required.
The runner kernel is not source-joined to the cited XNU signal implementation.
