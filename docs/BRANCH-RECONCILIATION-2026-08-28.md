# Branch reconciliation — 2026-08-28

This checkpoint makes the audited pre-existing branch tips ancestors of
`main` without replaying their older trees over newer work. The reconciliation
commit uses Git's `ours` merge strategy: its tree is byte-for-byte the tree of
`eaf285dac352efa9bed7f37edee5440f666612e3`, while its additional parents keep
the original branch histories reachable.

## Tips already delivered by merged pull requests

These tips are the heads recorded by their merged pull requests. Git had called
them unmerged only because GitHub created new merge or squash commits.

- `codex/aurora65-gui-proof` (`64242325e`) — PR #16
- `codex/code-target-families` (`9a6c66803`) — PR #24
- `codex/game-quality-breaker` (`9503a6e5b`) — PR #58
- `codex/game-quality-next` (`34eac266c`) — PR #56
- `codex/game-quality-rally` (`f9055a567`) — PR #57
- `codex/game-quality-vault` (`75cb93245`) — PR #59
- `codex/ios-embedded-assets-fix` (`946c53045`) — PR #14
- `codex/ios-share-popover-fix` (`7b75fe1dd`) — PR #15
- `codex/nova-grid` (`946469caf`) — PR #34
- `codex/pc118-makecode-followup` (`2fcb95835`) — PR #28
- `lane/bluetooth-and-gates` (`7c30fdf2c`) — PRs #29, #30, and #32
- `lane/original-path-honest` (`334af9096`) — PR #71

## Tips audited against newer `main`

- `fix/arcade-position-operators` (`5b792944a`): the runtime test is
  byte-identical on `main`; the earlier Calliope translator, fixtures, arrays,
  bit operations, and refusal handling are present with later import/export and
  round-trip improvements.
- `feat/device-choice-and-pico-bootrom` (`dcecbb41e`): the useful LANES result is
  already on `main`. Its other change targeted `CLAUDE.md`, which is now
  intentionally untracked and ignored.
- `fix/lite-fetch-pinning` (`b1587d511`): the pin resolver and documentation are
  byte-identical on `main`. The gate and mutation prover landed as `643540772`
  through `799e91395` and have since been extended for additional fetch sites.
  Replaying the old workflow would undo the current manual/nightly Vercel policy.
- `probe/lite-timeout-thresholds` (`1c20cdc0a`): the four measurement scripts are
  byte-identical on `main`. The census, CI construction gate, measured sweep, and
  current-count rebase landed as `483bf7529` through `27c27c6ef`.

The concurrently created `lane/extension-security-plan` branch is deliberately
not a parent of this checkpoint: it is new active work, not one of the audited
stale branches.
