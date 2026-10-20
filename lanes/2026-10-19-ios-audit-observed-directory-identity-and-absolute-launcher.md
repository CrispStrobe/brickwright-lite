## iOS audit: observed directory identity and absolute launcher — 2026-10-19

Directory-only event39239129340 completed successfully atb880ca774, with seven other
jobs skipped. Official originals were acquired once. The original full-stat reader
refused its invalid link-count stability assumption after adding a state file; that
refusal remains retained. A distinct independent reader passed only the directory
identity/refusal/cancellation joins, explicitly recording changed link counts and
refusing any full-stat immutability, link-semantics, namespace or app claim. Five
reader controls include changed link count and changed inode as separate cases.
The directory class bytes remain unchanged in this candidate.

The unwired bounded command adapter now uses the absolute system xcrun launcher.
A new regression fails on the old PATH-resolved launcher and detects its restoration
through a source mutation. Authored subprocess controls redirect only the explicit
unit execution boundary, preserving production argv assertions and real owned
process/stream/cleanup behavior. Container and launch fixtures use the same explicit
boundary. The directory profile control compares stable identity fields rather
than promoting mutable link count to identity. No production directory guard or
threshold changed. Actual SDK/environment binding, service/family ownership,
resources, guarded wrapper and affected installed qualification remain open.
