## Arcade UTF8 Buffer construction — 2026-10-12

CLAIMED — Codex, `lane/arcade-buffer-utf8-20261012`, stacked on PR834.
Own Buffer UTF8 construction, native reporter/block/dialect, typed MakeCode
export and targeted producer adoption, Unicode and original-runtime controls,
and the Buffer import contract. Match the pinned original TextEncoder path,
including surrogate replacement and embedded NUL, with a byte allocation bound
before encoding. E10 retains AST/import/type lowering; no importer helpers,
painter, project serialization or other peer-owned files are taken. Keep PR810
and PR834 qualification independent; do not promote the immutable corpus count.
