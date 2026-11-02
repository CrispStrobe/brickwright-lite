# x86 read16 browser observation (X86-NEXT-LANES Follow-up A)

Claim and result in one PR. Branch `lane/x86-read16-browser-observation-20261102`.
Observation only: no product source changes.

## Scope

Owned paths: this file and the one-shot, label-gated workflow
`.github/workflows/x86-read16-browser-observation.yml` (trigger label
`x86-read16-observation`; it never gates other PRs).

Identities (the PR1503 pin move and nothing else):

- A: Lite `0e6112ed9378cb371522f0c143e08d719d943c85` (PR1503 first parent), board `c7bcbe4bcd583d2215372dd4ee1e65002e249a04`
- B: Lite `e6fa377008c677b6dcd24f177453d4118955666d` (PR1503 merge), board `8785e4688cc308b34fea434c1734523caa621f74`

Official Pages artifacts for these commits are no longer retained, so one
hosted job builds both apps with the same steps on one runner and runs the
existing FreeDOS 1.4 boot-to-C: scenario (`scripts/verify-i80386-freedos-real-browser.mjs`
from B, used unchanged for both builds) alternately A,B,A,B,...

Not physical 386 timing; no performance or RTx claim beyond the observed runs.

## Result

Pending.
