## Arcade Buffer chunking — 2026-10-12

CLAIMED — Codex, `lane/arcade-buffer-chunking-20261012`, stacked on PR844.
Extract original bufferChunked, chunkLen and Buffer.chunkedFromUTF8. Preserve
single-chunk alias/readonly identity, detached multi-chunk storage, UTF16 slice
and original UTF8 boundary behavior. Bound collection creation and refuse unsafe
nonprogressing sizes explicitly. Native Buffer[] references, blocks, Code words
and typed export require original traces, alias mutation and fresh SB3 controls.
E10 retains importer/shared type helpers. No whole-corpus promotion or visible
GUI qualification follows from vocabulary and headless fixture tests alone.
