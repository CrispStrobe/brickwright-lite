# Browser gate rehabilitation campaign

Started 2026-08-30. Estimated hands-on work: **3–5 hours**. This is the task
list for the eleven scripts still named in `KNOWN_UNWIRED` by
`test/gate-coverage.test.mjs`. A green exit caused by an absent selector, a
comment-only workflow mention, or a skipped scenario does not satisfy any DoD.

## Definition of done shared by every gate

1. Reproduce the old result against the current deployed app and state whether
   the defect is in the probe, setup, or product.
2. Assert behavior, not mere DOM presence. Record denominators/counts where a
   gate covers multiple controls or fixtures.
3. Demonstrate the detector can fail: a targeted mutation, a discriminating
   negative fixture, or a before/after run against the known-broken premise.
4. Pass against a production build with zero uncaught page errors and no silent
   scenario skip.
5. Appear in an executable workflow `run:` command. A prose comment does not
   count. Upload screenshots for visual/layout claims.
6. Stay within the build's 30-minute ceiling. Replace fixed sleeps with
   condition waits; do not raise the ceiling to hide probe cost.

## Wave A — shell, navigation, and panels (60–90 minutes)

- [x] `verify-about-dialog.mjs`
  - DoD: open the real About surface; prove build identity, legal/about content,
    and close/reopen behavior; screenshot; detector fails if identity is absent.
- [ ] `verify-controller-panel.mjs`
  - DoD: reach the current controller/widgets surface through user-visible
    navigation; round-trip one edit/cancel contract; prove a bound input reaches
    its consumer; screenshot and negative binding case.
- [ ] `verify-instruments-scroll.mjs`
  - DoD: canonical circuit panel only; every instrument remains reachable at the
    constrained viewport; bottom control scrolls into view and is actionable.
- [x] `verify-intro.mjs`
  - DoD: open a current example's intro through visible controls; require its
    content heading plus level and age badges without stale sleeps or modal
    interference; fail on page errors and retain a failure screenshot.

## Wave B — circuit interaction and rendering (75–120 minutes)

- [ ] `verify-chrome-sweep.mjs`
  - DoD: all enumerated browser/layout scenarios execute with an asserted count;
    each user gesture changes the intended state; screenshot failing scenario.
- [ ] `verify-faceplate-matrix.mjs`
  - DoD: every declared faceplate case is exercised with an asserted denominator;
    inputs and displays both have behavioral evidence; artifact matrix uploaded.
- [x] `verify-interaction.mjs`
  - DoD: run against the current designer, canonical canvas scoped; drag/click
    effects measured; no palette-as-workspace or second-portal false readings.
- [x] `verify-schematic.mjs`
  - DoD: every fixture/scenario count asserted; schematic geometry and view
    transitions measured; screenshots stored under the repository artifact path.

## Wave C — execution and shipped content (45–75 minutes)

- [x] `verify-basic-run.mjs`
  - DoD: `10 PRINT 2+2` executes independently on the real 6502 and BBC BASIC
    profiles; each terminal contains an exact standalone `4` line, each profile
    fails independently under an expected-output mutation, and screenshots plus
    terminal transcripts are uploaded.
- [x] `verify-ssd1306-face.mjs` — removed as subsumed by the already-wired
  `verify-aurora65-workstation.mjs`, which now asserts the physical SSD1306 face,
  boots the shipped ROM, and measures non-blank device GDDRAM and controller
  pixels. Removing either renderer or device registration makes that gate red;
  stale bundle-source spelling is no longer treated as behavioral evidence.
- [x] `verify-starter-journeys.mjs`
  - DoD: assert all three shipped journey paths, search by the exact displayed
    `motor flyback` topic, open a current catalog project, exercise circuit,
    board, and LEGO destinations, and prove saved progress/navigation changes.

## Campaign closeout (30–45 minutes plus CI wall time)

- [ ] `KNOWN_UNWIRED` is reduced to the honestly blocked residual, target zero.
- [ ] The ratchet rejects comment-only, skipped, and missing workflow commands.
- [ ] `actionlint`, focused Node tests, overlay/package equality, and wait census
  pass without raising ceilings.
- [ ] Every integration checkpoint is pushed; vendor freshness and the complete
  build/browser/deploy/deployed-GUI workflow are green on the final code commit.
- [ ] `LANES.md` moves the claim to DONE with commits, gate counts, detector
  proofs, artifacts, CI run IDs, and any remaining refusal named explicitly.
