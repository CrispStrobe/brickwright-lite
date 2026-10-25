## Arcade Buffer root inspection — 2026-10-13

CLAIMED — Codex, `lane/arcade-buffer-roots-20261013`, stacked on PR855.
Implement read-only root traversal, backing-store accounting, scoped nested
arrays and serialized reference observations with bounded incomplete results.
No automatic sweep, complete-root claim, new opcode or producer pin change.
Explicit hidden-owner leases and preallocation reservations remain required.
Scope and followup method are in the Buffer contract;142/41/1 unchanged.
