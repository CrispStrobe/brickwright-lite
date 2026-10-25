## Arcade Buffer Base64 — 2026-10-12

CLAIMED — Codex, `lane/arcade-buffer-base64-20261012`, stacked on PR843.
Extract original Buffer.fromBase64 and bufferToBase64 with their shared alphabet
and parsing functions. Compare padding, incomplete groups, URL-safe characters
and malformed inputs against executed pinned MakeCode, retaining its actual
semantics. Bound decoded allocation, preserve mutable construction and readonly
encoding, scoped references and explicit failures. Add native blocks, Code
vocabulary, typed original export and fresh SB3 controls. E10 retains importer
and shared type helper ownership. Locked corpus classifications remain unchanged
until complete original projects pass their acceptance criteria.
