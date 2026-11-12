# SAMD retained-evidence custody — 2026-11-12

Status: input custody verified; original consumer-result custody remains open.
This handoff supplements the existing
[adoption record](SAMD-NATIVE-GAME-HANDOFF.md) without promoting its historical
results to a new runtime or physical-hardware qualification.

[PR1533](https://github.com/CrispStrobe/brickwright-lite/pull/1533) landed as
`9f1a620f2aae5ee988ed02069a8bf34c18949123` with 17 successful checks, 11 conditional
skips and one enabled failed admission check. The
[failed check](https://github.com/CrispStrobe/brickwright-lite/actions/runs/40836953746/job/123335306292)
remains a failure. [PR1562](https://github.com/CrispStrobe/brickwright-lite/pull/1562)
corrected that record; later policy changes do not change the original verdict.

The current standalone readback opened all 24 retained files in the following
input groups and matched their bytes and SHA256 digests to the existing
manifests: 284,547,326 bytes in total. This verifies retained input custody and
includes the archived metadata and original logs as well as the input archives.

| Retained input group | Original run | Files matched |
| --- | --- | --- |
| Frontend | [40783464522](https://github.com/CrispStrobe/brickwright-lite/actions/runs/40783464522) | 6 |
| Native executable | [40803428616](https://github.com/CrispStrobe/brickwright-lite/actions/runs/40803428616) | 7 |
| SAMD engine and producer results | [40699886470](https://github.com/CrispStrobe/bw-board/actions/runs/40699886470) | 11 |

The consumer-result custody is a separate unresolved boundary:

| Historical result | Exact job | Observed official status |
| --- | --- | --- |
| Browser game, run40826297334 | [browser123290650463](https://github.com/CrispStrobe/brickwright-lite/actions/runs/40826297334/job/123290650463) | SUCCESS; the overall run failed in its installed job123290650497 |
| Installed game, run40828345515 | [installed123297230735](https://github.com/CrispStrobe/brickwright-lite/actions/runs/40828345515/job/123297230735) | SUCCESS; browser was conditionally skipped |

The prior acceptance record reports three fresh games per realm, 102 RGB frames,
press/release behavior, sampled RSS and identity joins. This review has not
accessed those original result archives, so it does not establish a new
independent audit of those frames. The needed artifact names are
`samd-actual-browser-game` and `samd-actual-installed-game`. On 12 November both
runs' artifact listings contained zero entries; their source workflows declared
14-day retention. That listing does not establish the status of a custodian's
retained copy. No original was downloaded again and no guest was replayed.

The later selected-tier policy and consumer-event wiring landed through
[PR1536](https://github.com/CrispStrobe/brickwright-lite/pull/1536), merge
`81d8f4929a17e1d0c645c07b99eda0dd818d9642`, reviewed head
`2e7846f8a901726a296e3a8ef006cff24bc457b5`. Its PR rollup has 19 successes and
10 conditional skips; its automatic fast run40869114327 succeeded. However,
the separate full run40869128682 on that same head failed: 33 jobs succeeded,
four were conditionally skipped and these two failed:

- [browser (heavy), job123463606621](https://github.com/CrispStrobe/brickwright-lite/actions/runs/40869128682/job/123463606621).
- [browser (light), job123463606624](https://github.com/CrispStrobe/brickwright-lite/actions/runs/40869128682/job/123463606624).

The fast result and policy landing do not establish successful full-run
application acceptance. Preserve those failed contexts with the delivery owner;
this review did not acquire their logs or determine their causes.

Remaining work:

1. Identify the custodian and locate the already-retained browser and installed
   result archives, their acquisition records and identity receipts.
2. Review those originals with a standalone reader, joining consumer, frontend,
   executable, observer, engine, profile and firmware identities before any new
   independent frame/input/memory acceptance claim. Do not replay or download a
   successful original merely to read it.
3. Reconcile the separate full-run heavy/light failures through their owning
   delivery lane before claiming that acceptance complete. Preserve the original
   failures, thresholds and assertions; do not rerun an unchanged failure.

Physical capture, a normal SAMD GUI compile/import/export route and universal
real-time performance remain separately scoped work.
