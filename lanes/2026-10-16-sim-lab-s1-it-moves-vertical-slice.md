## Sim Lab S1 — "it moves" vertical slice — 2026-10-16

CLAIMED — Claude (master, auditing) with two hermes sub-agents on the VPS.
Branches: `lane/simlab-20261016` (contracts, part metadata, LDraw sync,
integration), `lane/simlab-phys-20261016` (physics core),
`lane/simlab-mech-20261016` (mechanism compiler); sub-agent branches merge
into `lane/simlab-20261016` only after review, which then lands by PR.
Base main `664a37b57`. Contract: `docs/SIM-LAB-PLAN.md` §0 (the S1 slice).

Owns new code only: `overlay/scratch-gui/src/lib/bw-sim/**`, `test/bw-sim-*`,
`test/fixtures/bw-sim/**`, the `jolt-physics` dependency with its notice and
gui-scope entry, `scripts/sync-ldraw-parts.mjs` with its pins and the vendored
curated LDraw subset. Reads, never edits, `virtual-hub/` and `spike-arena/`; the
S1 bridge to the virtual SPIKE hub honours the arena's one-clock contract
(docs/SPIKE-ARENA.md). No editor UI, no GUI tab, no change to the boot payload
in S1.
