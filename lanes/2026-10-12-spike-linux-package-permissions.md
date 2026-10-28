## SPIKE Linux package permissions — 2026-10-12

CLAIMED — Codex SPIKE integration, isolated branch
`fix/spike-package-permissions-20261012`, base
`42e8b6b4e31c901d415098e33b85bc69edd27336`.
Envelope: `scripts/build-spike-linux-desktop.mjs`, new
`scripts/lib/spike-linux-package-modes.mjs`, focused Linux package/mode tests,
`docs/SPIKE-LINUX-DESKTOP.md` and this ledger. Refuse staging filesystems that
cannot preserve required Unix permissions before native compilation. Normalize
package directories, data files and the closed executable allow-list explicitly;
reject nonregular entries and preserve every file's bytes. Existing inputs and
outputs, guest/native source, frontend, dependency pins and licensing boundaries
remain unchanged. Qualify restrictive-umask packaging and the observed unsupported
filesystem failure without claiming full G05 or distributed release closure.
