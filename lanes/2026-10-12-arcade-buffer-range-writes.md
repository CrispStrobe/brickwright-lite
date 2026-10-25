## Arcade Buffer range writes — 2026-10-12

CLAIMED — Codex, `lane/arcade-buffer-write-range-20261012`, stacked on PR835.
Own the missing explicit source offset/length Buffer.write operation in native
blocks, canonical Code, runtime and typed export, targeted producer adoption and
original-PXT range/overlap/readonly controls. Preserve the existing short write
opcode/Code spelling and its defaults. The underlying generated original write
algorithm is retained. E10 keeps importer/namespace/type-lowering ownership;
this lane extends its import contract only. No painter, storage or other peer
files are taken; existing candidate browser diagnostics remain independent.

Buffer range claim correction — the pinned original `base/shims.d.ts` and
original compiler expose only `Buffer.write(dstOffset, src)`. The simulator's
extra internal parameters are not a public API; the four-argument qualification
failed with a named compiler refusal. No range block/export is being adopted.
The isolated experiment and original failure logs are retained privately.
Codex instead claims `lane/arcade-buffer-readonly-20261012`, stacked on PR835:
public `Buffer.isReadOnly()` runtime/Boolean block/Code/export, producer adoption,
original-PXT mutation guard and roundtrip controls, and the importer contract.
E10 retains importer helpers. Existing Buffer writes and peer source stay intact.
