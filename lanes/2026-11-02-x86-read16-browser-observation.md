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

## Result (observation, hosted run 41416347074, artifact x86-read16-browser-observation-41416347074-1)

Host: one GitHub-hosted runner, ubuntu24 image 20261026.354.1, 4 vCPU Intel Xeon
Platinum 8573C, 16 GiB, Linux 7.0 azure, Node 22.23.3, Playwright Chromium.
Both apps were built in the same job with the same steps. Installed board
`src/experimental/i80386.js`: A `65041c0b…`, B `cee20c8f…`; their diff is exactly
the five-line two-byte `_readLinear` arm. Build manifests `0e6112e` / `e6fa377`.
Media: FreeDOS 1.4 floppy `03df6088…`, generated type-1 HDD `2fa9c252…`.

Scenario (non-interaction): boot, decline the installer with `n`, type `dir c:`
on the Widgets canvas, stop when the C: listing screen appears. All ten runs
passed with zero page errors and identical guest-rendered screens
(DOS prompt `b8bbdd59…`, C: listing `2954dec2…`, both the expected hashes).

| # | side | probe elapsed s | process wall s | guest time at stop s |
|---|---|---|---|---|
| 1 | A | 69.717 | 70.403 | 67.011 |
| 2 | B | 69.628 | 70.183 | 66.894 |
| 3 | A | 69.613 | 70.162 | 66.843 |
| 4 | B | 69.636 | 70.173 | 66.959 |
| 5 | A | 69.608 | 70.140 | 66.927 |
| 6 | B | 69.555 | 70.093 | 66.877 |
| 7 | A | 69.630 | 70.174 | 66.943 |
| 8 | B | 69.579 | 70.129 | 66.877 |
| 9 | A | 69.766 | 70.311 | 67.011 |
| 10 | B | 69.730 | 70.283 | 66.995 |

Median probe elapsed: A 69.630 s, B 69.628 s (B/A 1.000).

Reading: no wall-time difference is visible in this scenario. Wall time tracks
guest time (about 67 s of guest time per run), which suggests the app paces
this guest near real time here, so the scenario cannot show a CPU-side
read16 gain; it only shows that B renders the same output with no regression
on this host. Not physical 386 timing; no performance claim. The one-shot
workflow was removed again before merge.
