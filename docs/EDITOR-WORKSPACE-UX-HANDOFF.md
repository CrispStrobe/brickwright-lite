# Editor workspace delivery handoff

Updated 2026-10-29. The supplier menu work is qualified and merged. The combined Lite editor delivery is **not merged, qualified or deployed**.

## Current identities

- [CUI #131](https://github.com/CrispStrobe/bw-circuit-ui/pull/131) merged normally at `4b65f15485abbc039958d8e1a8a29ac3459b75f9`, tree `c07bedfe0a003c361621fbe9fb2b3a0bb9413d46`. All three exact-head checks passed. Independent original-log readback verified 83/83 scenarios, zero failures/skips, and all seven required browser/touch steps. CI and landed parents/tree matched the prediction. [Qualification run](https://github.com/CrispStrobe/bw-circuit-ui/actions/runs/40802516708).
- [Lite #1536](https://github.com/CrispStrobe/brickwright-lite/pull/1536) checkpoint `b1d4b5eadc17059feeb6a2d5d704942d51fe89b6` normally composes the complete frozen Circuit #1538 source `93aba75473e65042925928fe8c1a0a4427fd59ca`, editor source and main through `e15b7e11c8fdb0862ff73369dab50bf55ead52b8`. It explicitly adopts CUI `4b65f154`; Board remains `8785e4688cc308b34fea434c1734523caa621f74`.
- Keep `ci:full`. Combined [Build run 40822785950](https://github.com/CrispStrobe/brickwright-lite/actions/runs/40822785950) was pending at this checkpoint. Refresh the actual final head and checks before acting; no queued result is acceptance.

## Implemented source

- FPGA: Design/Build/Simulate workspaces, selectors in place of button walls, labelled information popovers and a show/hide minimap. Hidden workspaces retain editor state; diagnostics and unsupported boundaries remain visible.
- Paint/vector: one horizontally scrolling command band with Fill/Outline/width first, numeric hover/accessibility labels, one scrolling tool column, uniformly scaled regular polygons/stars. The standalone exported-SVG reader checks geometry independently; actual draw/export/save/reopen acceptance remains required.
- Pixel: compact foreground/background/swap controls and a 4-by-4 colour popover with touch-sized swatches and keyboard navigation.
- Code: grouped Robot-style overflow popup, keyboard file opening and persistent native file input. File/Edit menus expose real active-editor callbacks for Pixel/Tilemap, vector, sound, Robot and Circuit, with currentness/selection/availability guards and checked switches.
- Robot: Program connection already landed in Manual controls through #1487. All supported Brick buttons now use that folded section. The obsolete program-scanning detector and only its three utility tests were retired after a separate reachability audit; active Manual-controls and delivery/release assertions remain.
- Circuit: grouped accessible supplier menus and the host descriptor bridge. Canonical pin writer and npm-derived CUI integrity update both package declarations/locks; notice licence bytes match the landed source. This is metadata preparation, **not installed-package acceptance**.

## Failures preserved and bounded forward repairs

Previous editor head `8dcf060` failed unit shards 1/4/6, Build and browser light/heavy; its successful FPGA/Robot jobs do not qualify a different head. Retain those originals and their declared TODO/skip boundaries.

The new checkpoint records the actual generated menu translation catalogue, fixes the current Code-popup test double/source contract, follows Circuit popups by their originating trigger's `aria-controls`, opens File through its real button, and opens Pixel brush settings through the compact picker. It corrects a method extractor that accidentally included `componentDidUpdate`, preserving all 36 connection controls. Twenty-one focused menu/geometry/controller controls pass. A narrow static audit of 43 owned changed scripts/tests reports no gate-shape findings; the complete CI audit is still required. Local Manual-controls DOM tests could not load React in this worktree; the failure is retained, with no dependency installation or full local build.

## Continue in this order

The x86 owner released the producer identity hold after comparing the exact current candidate. The changed `CUI` constant is used only by the live adopted-dependency check; no consumed profile, source guard, budget or reader changed. Preserve the distinction when later composing the separate F10 work: historical globals stay historical, while only its current identity map and reviewed witnesses advance. This review does not qualify an actual guest run.

1. **Finish the known real browser failures.** Retained light-job evidence at the old head shows: Paint workspace exceeds a tablet viewport; the right-pane toggle intercepts the Pixel-opening button; the independent-handle journey uses an obsolete Finish-path lookup; bitmap rotation remains disabled after its selection; Code horizontal-menu navigation needs its actual focus state diagnosed; a micro:bit catalogue click is intercepted. Confirm each cause against current source/build, fix the owning UI/controller boundary, and preserve every image, transform, save/reopen, view/hit-testing and numerical assertion. Do not add retries, force clicks or larger timeouts to conceal these failures. Current phone/File and Pixel brush lookup repairs still need actual browser acceptance.
2. **Read the new combined qualification once.** The Circuit campaign owner retains numerical unit 2/3/6 intake and independent readers; give that owner the exact head, CUI pin, run and job IDs before numerical acquisition/readback. The x86 owner retains the old heavy-job benchmark original and diagnosis. Reuse retained originals; do not download whole-run logs that duplicate another owner's custody. Root owns combined GUI/artifact qualification.
3. **Complete actual application acceptance.** Exercise wide/narrow Paint and Pixel, all File/Edit/overflow menus by mouse and keyboard, Code file input close/reopen, FPGA workspace state/minimap, regular SVG geometry plus SB3 save/reopen, Manual controls input/release, and packaged Circuit/ADC/rearm/HOLD/refusal controls. Installed root/GUI package identity and notices must pass hosted provenance gates. Preserve all enabled checks; no source merge on focused host tests alone.
4. **Land only a qualified final candidate.** Require every enabled exact-final-head check SUCCESS, with only declared skips. Merge normally with a matched head and verify actual parents/tree against a fresh prediction. Close #1538 only after its entire source is preserved and qualified in main. Return the qualified main SHA/tree proof to the Robot owner before it composes foreign pins. Circuit campaign audit/final documentation remains with its owner.
5. **Deploy and inspect production.** Observe existing production runs before any single dispatch of `.github/workflows/deploy-daily.yml`. Deploy qualified current main through that guarded workflow; verify the live version contains the combined UX/Circuit source, then inspect real wide/narrow menus and editor layouts. Update this handoff with exact landed/deployed identities and any remaining limitations.

## Pin and evidence roles

`CONTRACT_SOURCES` in `scripts/lib/instrument-regression-cases.mjs` and its matching regression-workflow checkout are live source identities and advance with the package. Current adoption assertions advance too. The four sealed reference-qualified v2 workflow/profile/reader/receipt files remain byte-identical to frozen #1538. Do not create a new seal for ordinary live source, rewrite a consumed study to today's pins, replay its cohort/reader or relabel old results as combined acceptance.

Keep original v1 incomplete/failed boundaries, v2 measured identities, LM741 pending limits, magnitude-only long-capture scope, untested capture-size boundary and unsupported AC/ADC-watch cases. No physical calibration, hardware, release or broad accuracy claim is supplied by this UI work.

## Vercel incident

The incomplete `677f9bf` commit exposed a stale project-level Ignored Build Step: `bash scripts/vercel-ignore.sh`. The complete source tree was restored normally at `643f50c`; every original entry was independently compared. The script is intentionally absent. The obsolete project command was removed and fresh API reads confirmed it is null, preserving build/install/runtime settings; 21 existing deployment-policy controls pass. Repository Git-triggered deployment remains disabled in favour of the guarded workflow.

Production still reports `5cd027707eceed3451bd62eaa21125a051650e59` at `https://brickwright-lite.vercel.app/brickwright-version.json`. The configuration defect is fixed; **a fresh production deployment and live UX acceptance remain outstanding**. Do not retry the incomplete commit, add a dummy ignore script or bypass qualification.

Use hosted CI or a capable worker for builds and suites. Keep operator paths, credentials, raw receipts and session coordination in ignored private notes.
