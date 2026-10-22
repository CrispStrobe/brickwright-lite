# Register hosted Lab firmware in the CI inventories

CLAIMED — Codex hub-coverage owner, continuation of the merged own-firmware
claim #1234 and implementation #1239. Base `fe73f8de7`.

Amend that workflow's scope only for:

- `docs/generated/ci-step-census.json`: refresh only the new
  `robot-lab-own-firmware.yml` record through the existing census/scoped-merge
  APIs, using admitted real completed run/job metadata and exact source.
  Preserve every other workflow, ordered run, main revision and provenance.
- `test/gate-coverage.test.mjs`: remove only the now-wired
  `verify-sim-lab-renode-lockstep.mjs` entry from KNOWN_UNWIRED. Preserve all
  assertions and mutation controls; no new unwired exception.
- `CI-POINTERS.md`: only if a step has no completed observation yet, one dated
  truthful pointer naming this workflow's actual failed/pending observation.
  Do not manufacture success, dispatch a run for the census or hide failures.
- This claim's result.

The original unit failures and official observations remain retained. Run the
complete CI-step census and gate-coverage suites, including their unchanged
negative/mutation controls. No generator, classifier, threshold, timeout,
browser budget, dependency pin, firmware or native change is authorized here.
This metadata cannot qualify the still-pending embedded Python guest run.
All enabled exact-head checks and independent actual guest evidence remain
required before the implementation merges.
