## iOS audit: audit-token identity and diagnostic retention — 2026-10-19

The first isolated SDK preflight failed with no report artifact and only a generic
refusal. Its original event/job log is retained; the failing boundary is unknown.
The revised preflight records the admission and cleanup stages, host capabilities
and sanitized compiler diagnostics, and prints a bounded summary if artifact
upload is unavailable. Cleanup errors cannot skip writing the partial report.
The original failure remains a failure; no deadline, resource limit, assertion or
permission requirement is relaxed.

Unwired identity preparation now obtains a task-name right, reads the kernel's
audit token and compares read-only code-status/code-directory results through
`csops_audittoken`. It rejects changed tokens, UID/PID mismatch, invalid code status,
hash drift, short/error replies, cancellation and reentry. Port release is once
only; an undefined output after failed acquisition is never treated as an owned
right. Constructor failure retains its primary error and available originals.
There is no debugger/task-for-pid privilege fallback or target mutation.

The matching thin-arm64 reader verifies a supported primary SHA-256 ad-hoc
CodeDirectory against every covered executable page and derives its standard
truncated code hash. Unsupported versions, alternate directories, scatter tables,
truncated/overlapping ranges and changed pages refuse. This checks file consistency,
not signature trust. Its file digest still needs the independent source/build and
installed-file join. The SDK probe now checks these kernel APIs and the reader
against its one owned program; it still has no simulator or app launch.

Twelve authored identity/page controls and five runtime mutations cover the source
contracts. Original failed output-port cleanup and a fixture that changed the wrong
byte are preserved with their corrected controls. Actual SDK exports, task-name
permissions and installed-app behavior remain unqualified until their exact report
passes. Platform helper success cannot substitute for the actual target's permission,
resource, ownership, map and cleanup evidence.
