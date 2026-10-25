## iOS audit: explicit observer-tool ABI after missing SDK header — 2026-10-19

The second retained preflight stopped at compilation because the installed SDK
lacks `sys/codesign.h`. Python wait prerequisites were present; no helper or
kernel identity call ran. Keep this failure and the first unknown-boundary failure.
The same claimed workflow now declares only the two read-only code-sign operations
and `csops_audittoken` ABI using SDK types, with pinned XNU provenance in its v3
report. It checks the required real library exports before compilation, with no
privilege fallback. SDK Mach layouts and all kernel, identity, CPU/RSS and cleanup
assertions remain mandatory. No Apple implementation is vendored. This is observer
tool interop, not a shipped-app API or SDK-header availability claim. One corrected
source-bound preflight is needed before platform admission; actual app/family
qualification remains false.
