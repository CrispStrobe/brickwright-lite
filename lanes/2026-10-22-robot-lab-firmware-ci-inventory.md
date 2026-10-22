# Register hosted Lab firmware in the CI inventories

SOURCE COMPLETE — Codex hub-coverage owner, continuation of the merged own-firmware
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

The existing census/scoped-merge APIs recorded the admitted original failed
run 39862908482 at exact source c9512f12299c93213be42deb00fa349679e68ba7.
Independent comparison preserved all 24 prior workflow objects, 320 ordered
runs, main revision and newest-main-run identity. Python has zero completed
observations in these readings; one dated pointer states that limit. The
now-wired lockstep entry alone is removed from KNOWN_UNWIRED. All 20 complete
census/gate controls pass, including the original mutation assertions.
No guest success, new dispatch or broad census refresh is inferred.
