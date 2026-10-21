## Arcade Buffer packing — 2026-10-12

CLAIMED — Codex, `lane/arcade-buffer-packing-20261012`, stacked on PR845.
Extract original packedSize/pack/packAt/unpack and the common format parser.
Retain endian switches, repeated fields, padding, offsets, readonly storage,
missing/extra numbers and original unsupported-format diagnostics. Bound parser
work and result allocation before unsafe loops/copies; no truncated-success
results. Native scoped number arrays, blocks, Code and typed export require
original traces, function-return controls and actual fresh SB3. E10 retains
importer/shared type helper ownership. Hosted qualification and corpus recensus
remain separate from focused source controls.
