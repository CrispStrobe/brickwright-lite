# bw-board pin c87cfa32 -> 6efff7f4: 386 debugger code listing

Owner: x86 lane (Claude Code agent for the repository owner). Claim and
change in one PR.

bw-board #726 (merge `6efff7f4d180ad7552ac79c8b779fefd2d1b1d5c`) gives the 386
debug target `disasm`/`nextCodeAddress`, so the debugger drawer lists
clickable 386 code rows at linear addresses instead of "no disassembly on this
target". The move also carries bw-board #722-#725 (ESP32-S3/S040 profile and
engine catalog, paired-v3 harness, low-RAM read), already on bw-board master.

Paths: exact SHA swap across the current pin surfaces (vendor-pins, package
specs/lock, bundled pins, provenance/licence sources, workflows, x86 F10 pin
literals, package-adoption tests, pin-move chain), regenerated census snapshot
and language-device matrix, and a drawer-row assertion added to
`scripts/verify-i80386-freedos-vga-browser.mjs` (light browser shard): pause,
open the drawer, several "Click to pause here" rows, first row is the PC.
Historical docs keep their recorded pin. No 386 timing, guest or physical claim.
