## Arcade Buffer destination storage — 2026-10-13

CLAIMED — Codex, `lane/arcade-buffer-storage-20261013`, stacked on PR853.
Remove redundant detached-slice and UTF-8 copies while retaining original
simulator semantics and before-allocation byte limits. No new public opcode
or producer pin. Live-run tracing, serialization roots and aggregate allocation
reservations remain separate work. Parent PR850 exact head f30e57cfa2 passed
all enabled checks, including the native editor/controller/reopen/export proof;
this new source needs independent qualification. Whole-app142/41/1 unchanged.
