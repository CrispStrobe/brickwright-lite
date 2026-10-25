## STM32 composition: original 386 boot register reader — 2026-10-16

DONE candidate — Codex root, branch `lane/stm32-compose-20261016`, isolated
`local worktree/receipt (see ignored local handoff)`, amendment based on main `e1e5bc30b`.
Merge this claim before changing the existing synthetic boot assertion in
`scripts/verify-i80386-local-hdd-gui.mjs`: read the selected supplier's `edi`
instead of absent `di`, retaining equality to42, exact halted/PC/canvas checks
and the existing timeout. The exact installed f84 supplier and a read-only
production diagnostic expose `edi=42`, `pc=0x7c1a`, `halted=true`, VGA720×400;
the original gate is retained as failed evidence. Own only this contract-reader
hunk, a focused regression control and this ledger. No new engine or pin move.

The x86 lane retains its distinct new persistence/original-witness and
forward-debug scenarios in this same script, all supporting files, its branches
and its acceptance requirements. Its published composition currently preserves
the same stale original synthetic assertion. This narrow dependency-adoption
reader repair carries no persistence or debugger acceptance and takes over none
of those scenarios. Preserve any newer owner work during normal composition.
No relaxed comparison, fallback register name, timeout increase, skipped gate,
CI bypass or source rewrite is permitted. The corrected actual browser gate
and all enabled final-head source checks must pass before integration merge.

The original synthetic check now reads `edi` with all other comparisons and
timeouts unchanged. The unchanged original failed locally at45000ms and in both
hosted light jobs; those logs remain retained. The corrected production journey
passes using the same selected Boardf84, owned disk SHA256
`f9e63c15c20fc87058d053c3badbc0d146206543af0dc2af7a7e05537184474a`
and unchanged config: halted PC31770, VGA720×400, actual guest pixels equal the
video frame, nonblack marker and zero browser errors. Receipt and screenshot:
`local worktree/receipt (see ignored local handoff)`, `local worktree/receipt (see ignored local handoff)`.
The failed original is the regression negative; no duplicate source-spelling
test is added for this one-line reader fix. One automatic fresh final-head CI
set remains required before PR1017 merges; original PR975 remains untouched.
