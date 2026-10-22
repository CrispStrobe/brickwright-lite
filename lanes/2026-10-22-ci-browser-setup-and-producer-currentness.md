# Repair actual browser setup and producer-metadata races

CLAIMED — owner: user-requested PR repair sweep, isolated branch
`lane/ci-browser-setup-repair-claim-20261022`, base `7794fdbdf`.

PR1222's retained full run failed before several test shards started: Ubuntu
Azure mirror downloads exhausted the existing Playwright setup deadlines; an
FPGA retry inherited a root apt-get lock after its outer timeout. Separately,
the official SDK consumer ran after its declared build dependency succeeded,
but the API still reported that exact producer job as in progress. Keep all
original failures and every existing admission assertion.

Own only the Playwright installation commands in `.github/workflows/build.yml`,
new `scripts/prepare-playwright-apt.mjs`, and complete
`test/ci-playwright-setup.test.mjs`. Prefer the official HTTPS Ubuntu archive
only for the known Azure archive URI in its ephemeral runner's apt source
entries; retain suites, components, signatures, keys and every dependency.
Use the locked local Playwright tool where already installed and the existing
root-owned timeout-group pattern for privileged retries. Preserve the existing
step/job deadlines, retry upper bounds, gate steps, conditions and assertions.
No dependency, budget, test filter, skip, release or application behavior change.

Also own only bounded metadata observation before admission in
`scripts/admit-official-gui-artifact.mjs` and
`scripts/lib/official-gui-artifact.mjs`, with complete async controls in new
`test/official-gui-producer-completion.test.mjs`. Observe at most 60 seconds
within the existing consumer budget, only while the exact discovered job is
pending, retaining its run/attempt/head/job/artifact identities. Completed
failure, invalid status, changed identity and timeout must refuse. Do not retry
an admission assertion, substitute a producer, fetch another archive or relax
the completed-successful-job, exact-source, unique-artifact or lifetime rules.

Require meaningful original-failure/negative controls, canonical workflow and
admission controls, and a complete final-head hosted set that actually runs
every selected browser/compiler/physical gate. A setup-only or partial result
cannot qualify the source. Preserve the separate Arcade semantic and native
installed-acceptance holds; no automatic activation follows.

## Implementation and local qualification

Implementation DONE in successor `lane/ordinary-omission-repair-20261022`;
final-head hosted qualification remains required. All 31 complete setup,
workflow, artifact-admission and producer-observation controls pass, no skips.
The source-only local admission checks resolve only JSZip from the verified
canonical ROOT dependency cache (key `9f9ba058ac1c2faa98da4339`); no GUI
provider, factory, product result or test body is replaced. Fresh hosted checks
use normal locked dependencies. Deliberately returning the first pending
snapshot fails all five new observation controls; removing the exact-identity
assertion fails the identity control. All original hosted failures and raw
metadata are retained. Every raw API observation is preserved before admission,
and the pure validator remains unchanged. No setup result counts as compiler,
browser, physical or installed-native acceptance.
